using System.Net;
using System.Text;
using ContourLab.Api.Controllers;
using ContourLab.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace ContourLab.Api.Tests;

public class DhfArtifactsTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(respond(request));
    }

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler) { BaseAddress = new Uri("https://api.github.com") };
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static GitHubService Service(Func<HttpRequestMessage, HttpResponseMessage> respond, string? token = "t")
    {
        var values = new Dictionary<string, string?>();
        if (token is not null) values["GITHUB_TOKEN"] = token;
        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new GitHubService(new FakeFactory(new FakeHandler(respond)), config);
    }

    private static HttpResponseMessage Route(HttpRequestMessage r, bool expired = false, bool noRuns = false)
    {
        var path = r.RequestUri!.AbsolutePath;
        if (path.EndsWith("/runs")) return Json(noRuns ? """{"workflow_runs":[]}""" : """{"workflow_runs":[{"id":7}]}""");
        if (path.EndsWith("/artifacts"))
            return Json($$"""{"artifacts":[{"name":"dhf-artifacts","expired":{{(expired ? "true" : "false")}},"archive_download_url":"https://api.github.com/zip"}]}""");
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) };
    }

    [Fact]
    public async Task Download_ReturnsZipContent()
    {
        var download = await Service(r => Route(r)).DownloadLatestDhfArtifactAsync();
        using var ms = new MemoryStream();
        await download.Content.CopyToAsync(ms);
        Assert.Equal([1, 2, 3], ms.ToArray());
        Assert.Equal("dhf-artifacts-run-7.zip", download.FileName);
    }

    [Fact]
    public async Task Download_FallsBackToLaterRun_WhenNewerRunHasNoArtifact()
    {
        var download = await Service(r =>
        {
            var path = r.RequestUri!.AbsolutePath;
            if (path.EndsWith("/runs")) return Json("""{"workflow_runs":[{"id":9},{"id":8}]}""");
            if (path.EndsWith("/runs/9/artifacts")) return Json("""{"artifacts":[]}""");
            return Route(r);
        }).DownloadLatestDhfArtifactAsync();
        Assert.Equal("dhf-artifacts-run-8.zip", download.FileName);
    }

    [Fact]
    public async Task Download_SkipsExpiredNewerRun_AndUsesLaterValidRun()
    {
        var download = await Service(r =>
        {
            var path = r.RequestUri!.AbsolutePath;
            if (path.EndsWith("/runs")) return Json("""{"workflow_runs":[{"id":9},{"id":8}]}""");
            if (path.EndsWith("/runs/9/artifacts"))
                return Json("""{"artifacts":[{"name":"dhf-artifacts","expired":true,"archive_download_url":"https://api.github.com/old"}]}""");
            return Route(r);
        }).DownloadLatestDhfArtifactAsync();
        Assert.Equal("dhf-artifacts-run-8.zip", download.FileName);
    }

    [Fact]
    public async Task Download_RequestsOnlyCompletedRuns()
    {
        string? query = null;
        await Service(r =>
        {
            if (r.RequestUri!.AbsolutePath.EndsWith("/runs")) query = r.RequestUri.Query;
            return Route(r);
        }).DownloadLatestDhfArtifactAsync();
        Assert.Contains("status=completed", query);
    }

    [Fact]
    public async Task Controller_Returns502_OnGitHubError()
    {
        var service = Service(_ => new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("no") });
        var result = await new DhfArtifactsController(service).DownloadLatest(default);
        Assert.Equal(502, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Download_Throws_WhenArtifactExpired() =>
        await Assert.ThrowsAsync<GitHubArtifactNotFoundException>(() =>
            Service(r => Route(r, expired: true)).DownloadLatestDhfArtifactAsync());

    [Fact]
    public async Task Download_Throws_WhenNoRuns() =>
        await Assert.ThrowsAsync<GitHubArtifactNotFoundException>(() =>
            Service(r => Route(r, noRuns: true)).DownloadLatestDhfArtifactAsync());

    [Fact]
    public async Task Download_Throws_OnNon2xx() =>
        await Assert.ThrowsAsync<HttpRequestException>(() =>
            Service(_ => new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("no") })
                .DownloadLatestDhfArtifactAsync());

    [Fact]
    public async Task Controller_Returns503_WhenTokenMissing()
    {
        var result = await new DhfArtifactsController(Service(r => Route(r), token: null)).DownloadLatest(default);
        Assert.Equal(503, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Controller_Returns404_WhenNoArtifact()
    {
        var result = await new DhfArtifactsController(Service(r => Route(r, noRuns: true))).DownloadLatest(default);
        Assert.Equal(404, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Controller_ReturnsFile_OnSuccess()
    {
        var result = await new DhfArtifactsController(Service(r => Route(r))).DownloadLatest(default);
        Assert.Equal("dhf-artifacts-run-7.zip", Assert.IsType<FileStreamResult>(result).FileDownloadName);
    }
}
