using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ContourLab.Api.Tests;

/// <summary>
/// @links:SRS-017
/// Verifies that GET /api/health returns 200 OK with service name and status fields.
/// </summary>
public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact(DisplayName = "GET /api/health returns 200 OK @links:SRS-017")]
    public async Task GetHealth_Returns200Ok()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact(DisplayName = "GET /api/health response contains service name and status @links:SRS-017")]
    public async Task GetHealth_ResponseContainsServiceNameAndStatus()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");
        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);

        Assert.True(doc.RootElement.TryGetProperty("status", out _),
            "Response must contain 'status' field");
        Assert.True(doc.RootElement.TryGetProperty("service", out var serviceEl),
            "Response must contain 'service' field");
        Assert.False(string.IsNullOrEmpty(serviceEl.GetString()),
            "'service' field must not be empty");
    }
}
