var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("DevCors");
}

app.UseAuthorization();
app.MapControllers();
app.MapPost("/debug/client-log", (ClientDebugLogEntry entry, ILogger<Program> logger) =>
{
    logger.LogInformation("CLIENT {Scope}: {Message}", entry.Scope, entry.Message);
    return Results.Ok();
});

app.Run();

internal sealed record ClientDebugLogEntry(string Scope, string Message);
