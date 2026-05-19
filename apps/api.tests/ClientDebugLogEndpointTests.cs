using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ContourLab.Api.Tests;

public class ClientDebugLogEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact(DisplayName = "POST then GET /debug/client-log persists client debug entries")]
    public async Task ClientDebugLog_RoundTripsEntries()
    {
        var client = factory.CreateClient();
        await client.DeleteAsync("/debug/client-log");

        var postResponse = await client.PostAsJsonAsync("/debug/client-log", new
        {
            scope = "ThreeDViewport",
            message = "render queued"
        });

        Assert.Equal(HttpStatusCode.OK, postResponse.StatusCode);

        var getResponse = await client.GetAsync("/debug/client-log");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        using var doc = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        var entries = doc.RootElement;
        Assert.True(entries.ValueKind == JsonValueKind.Array);
        Assert.True(entries.GetArrayLength() >= 1);

        var last = entries[entries.GetArrayLength() - 1];
        Assert.Equal("ThreeDViewport", last.GetProperty("scope").GetString());
        Assert.Equal("render queued", last.GetProperty("message").GetString());
        Assert.True(last.TryGetProperty("timestampUtc", out _));
        Assert.True(last.TryGetProperty("sequence", out _));
    }

    [Fact(DisplayName = "GET /debug/client-log supports scope filter and limit")]
    public async Task ClientDebugLog_SupportsScopeFilterAndLimit()
    {
        var client = factory.CreateClient();
        await client.DeleteAsync("/debug/client-log");

        await client.PostAsJsonAsync("/debug/client-log", new { scope = "ThreeDScene", message = "ct cache miss" });
        await client.PostAsJsonAsync("/debug/client-log", new { scope = "ThreeDViewport", message = "render start" });
        await client.PostAsJsonAsync("/debug/client-log", new { scope = "ThreeDScene", message = "ct actor mounted" });

        var filteredResponse = await client.GetAsync("/debug/client-log?scope=ThreeDScene&limit=1");
        Assert.Equal(HttpStatusCode.OK, filteredResponse.StatusCode);

        using var doc = JsonDocument.Parse(await filteredResponse.Content.ReadAsStringAsync());
        var entries = doc.RootElement;
        Assert.Equal(1, entries.GetArrayLength());
        Assert.Equal("ThreeDScene", entries[0].GetProperty("scope").GetString());
        Assert.Equal("ct actor mounted", entries[0].GetProperty("message").GetString());
    }

    [Fact(DisplayName = "DELETE /debug/client-log clears buffered entries")]
    public async Task ClientDebugLog_CanBeCleared()
    {
        var client = factory.CreateClient();
        await client.DeleteAsync("/debug/client-log");
        await client.PostAsJsonAsync("/debug/client-log", new { scope = "ThreeDViewport", message = "render done" });

        var deleteResponse = await client.DeleteAsync("/debug/client-log");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);

        using (var deleteDoc = JsonDocument.Parse(await deleteResponse.Content.ReadAsStringAsync()))
        {
            Assert.True(deleteDoc.RootElement.GetProperty("cleared").GetInt32() >= 1);
        }

        var getResponse = await client.GetAsync("/debug/client-log");
        using var getDoc = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        Assert.Equal(0, getDoc.RootElement.GetArrayLength());
    }
}
