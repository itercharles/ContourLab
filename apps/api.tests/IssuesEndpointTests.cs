using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ContourLab.Api.Tests;

public class IssuesEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    // GITHUB_TOKEN is not set in the test environment, so every call that
    // reaches GitHubService.EnsureToken() returns 503.

    [Fact(DisplayName = "GET /api/issues returns 503 when GITHUB_TOKEN is not configured")]
    public async Task GetIssues_Returns503_WhenTokenNotConfigured()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/issues");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact(DisplayName = "GET /api/dhf-artifacts/latest returns 503 when GITHUB_TOKEN is not configured")]
    public async Task GetLatestDhfArtifacts_Returns503_WhenTokenNotConfigured()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/dhf-artifacts/latest");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("application/problem+json",
            response.Content.Headers.ContentType?.MediaType ?? "");
    }

    [Fact(DisplayName = "POST /api/issues returns 503 when GITHUB_TOKEN is not configured")]
    public async Task CreateIssue_Returns503_WhenTokenNotConfigured()
    {
        var client = factory.CreateClient();
        var body = new StringContent(
            """{"title":"Test issue","description":"A test description.","priority":"medium","category":"bug"}""",
            Encoding.UTF8,
            "application/json");

        var response = await client.PostAsync("/api/issues", body);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact(DisplayName = "POST /api/issues returns 415 when Content-Type header is absent")]
    public async Task CreateIssue_Returns415_WhenContentTypeAbsent()
    {
        var client = factory.CreateClient();

        // No Content-Type → ASP.NET Core cannot negotiate the body format → 415
        var response = await client.PostAsync("/api/issues", content: null);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Fact(DisplayName = "POST /api/issues returns 503 and ProblemDetails content-type")]
    public async Task CreateIssue_Returns503WithProblemDetails_WhenTokenNotConfigured()
    {
        var client = factory.CreateClient();
        var body = new StringContent(
            """{"title":"T","description":"D","priority":"low","category":"other"}""",
            Encoding.UTF8,
            "application/json");

        var response = await client.PostAsync("/api/issues", body);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("application/problem+json",
            response.Content.Headers.ContentType?.MediaType ?? "");
    }
}
