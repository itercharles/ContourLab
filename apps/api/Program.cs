var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

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
app.MapPost("/debug/client-log", (ClientDebugLogEntry entry, ILogger<Program> logger) =>
{
    logger.LogInformation("CLIENT {Scope}: {Message}", entry.Scope, entry.Message);
    return Results.Ok();
});

app.Run();

internal sealed record ClientDebugLogEntry(string Scope, string Message);

// Required for WebApplicationFactory in integration tests
public partial class Program { }
