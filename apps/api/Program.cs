using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<ClientDebugLogBuffer>();

builder.Services.AddHttpClient("github", c =>
{
    c.BaseAddress = new Uri("https://api.github.com");
    c.DefaultRequestHeaders.UserAgent.ParseAdd("contourlab-api/1.0");
});
builder.Services.AddHttpClient("autocontour", c =>
{
    var baseUrl = builder.Configuration["AutoContour:BaseUrl"]
        ?? Environment.GetEnvironmentVariable("CONTOURLAB_AUTOCONTOUR_SERVICE_BASE_URL")
        ?? "http://127.0.0.1:4010";
    c.BaseAddress = new Uri(baseUrl);
});
builder.Services.AddScoped<ContourLab.Api.Services.GitHubService>();
builder.Services.AddScoped<ContourLab.Api.Services.AutoContourServiceClient>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("LocalCors", policy =>
    {
        // Allow any origin on the frontend ports (3000 dev, 3001 deployed).
        // This covers localhost and any LAN IP when the deployed build binds on 0.0.0.0.
        policy.SetIsOriginAllowed(origin =>
              {
                  if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
                  return uri.Port is 3000 or 3001;
              })
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors("LocalCors");

app.UseAuthorization();
app.MapControllers();
app.MapPost("/debug/client-log", (ClientDebugLogEntry entry, ClientDebugLogBuffer buffer, ILogger<Program> logger) =>
{
    var stored = buffer.Append(entry.Scope, entry.Message);
    logger.LogInformation("CLIENT {Scope}: {Message}", stored.Scope, stored.Message);
    return Results.Ok();
});
app.MapGet("/debug/client-log", (ClientDebugLogBuffer buffer, string? scope, int? limit) =>
{
    var safeLimit = Math.Clamp(limit ?? 100, 1, 500);
    return Results.Ok(buffer.Read(scope, safeLimit));
});
app.MapDelete("/debug/client-log", (ClientDebugLogBuffer buffer) =>
{
    var removed = buffer.Clear();
    return Results.Ok(new { cleared = removed });
});

app.Run();

internal sealed record ClientDebugLogEntry(string Scope, string Message);
internal sealed record StoredClientDebugLogEntry(
    long Sequence,
    DateTimeOffset TimestampUtc,
    string Scope,
    string Message
);

internal sealed class ClientDebugLogBuffer
{
    private const int MaxEntries = 500;
    private readonly object _gate = new();
    private readonly Queue<StoredClientDebugLogEntry> _entries = new();
    private long _nextSequence = 0;

    public StoredClientDebugLogEntry Append(string scope, string message)
    {
        var entry = new StoredClientDebugLogEntry(
            Interlocked.Increment(ref _nextSequence),
            DateTimeOffset.UtcNow,
            scope,
            message
        );

        lock (_gate)
        {
            _entries.Enqueue(entry);
            while (_entries.Count > MaxEntries)
            {
                _entries.Dequeue();
            }
        }

        return entry;
    }

    public IReadOnlyList<StoredClientDebugLogEntry> Read(string? scope, int limit)
    {
        lock (_gate)
        {
            IEnumerable<StoredClientDebugLogEntry> query = _entries;
            if (!string.IsNullOrWhiteSpace(scope))
            {
                query = query.Where(entry => string.Equals(entry.Scope, scope, StringComparison.OrdinalIgnoreCase));
            }

            return query
                .TakeLast(limit)
                .ToArray();
        }
    }

    public int Clear()
    {
        lock (_gate)
        {
            var count = _entries.Count;
            _entries.Clear();
            return count;
        }
    }
}

// Required for WebApplicationFactory in integration tests
public partial class Program { }
