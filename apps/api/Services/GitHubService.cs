using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ContourLab.Api.Services;

public sealed class GitHubService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string? _token;
    private readonly string _repo;
    private readonly string _owner;
    private readonly string _repoName;
    private const string DhfArtifactName = "dhf-artifacts";
    private const string CiWorkflowId = "ci-pipeline.yml";

    public GitHubService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _token = configuration["GITHUB_TOKEN"];
        _repo = configuration["GITHUB_REPO"] ?? "itercharles/ContourLab";
        var parts = _repo.Split('/', 2, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2)
            throw new InvalidOperationException($"GITHUB_REPO must be in owner/repo format. Received '{_repo}'.");
        _owner = parts[0];
        _repoName = parts[1];
    }

    public async Task<GitHubArtifactDownload> DownloadLatestDhfArtifactAsync(CancellationToken cancellationToken = default)
    {
        EnsureToken();
        var client = _httpClientFactory.CreateClient("github");
        var workflowRuns = await ListMainWorkflowRunsAsync(client, cancellationToken);

        foreach (var run in workflowRuns)
        {
            var artifact = await FindDhfArtifactForRunAsync(client, run.Id, cancellationToken);
            if (artifact is null) continue;

            var content = await DownloadArtifactArchiveAsync(client, artifact.ArchiveDownloadUrl, cancellationToken);
            return new GitHubArtifactDownload(
                $"{DhfArtifactName}-run-{run.Id}.zip",
                "application/zip",
                content
            );
        }

        throw new GitHubArtifactNotFoundException("No unexpired DHF artifact exists on the latest main CI runs.");
    }

    private async Task<IReadOnlyList<GitHubWorkflowRunJson>> ListMainWorkflowRunsAsync(
        HttpClient client,
        CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/repos/{_owner}/{_repoName}/actions/workflows/{CiWorkflowId}/runs" +
            "?branch=main&event=push&status=completed&exclude_pull_requests=true&per_page=20");
        AddAuthHeaders(request);

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(cancellationToken)}");

        var payload = JsonSerializer.Deserialize<GitHubWorkflowRunsResponse>(
            await response.Content.ReadAsStringAsync(cancellationToken), JsonOptions);
        return payload?.WorkflowRuns ?? [];
    }

    private async Task<GitHubArtifactJson?> FindDhfArtifactForRunAsync(
        HttpClient client,
        long runId,
        CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/repos/{_owner}/{_repoName}/actions/runs/{runId}/artifacts?name={DhfArtifactName}&per_page=20");
        AddAuthHeaders(request);

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(cancellationToken)}");

        var payload = JsonSerializer.Deserialize<GitHubArtifactsResponse>(
            await response.Content.ReadAsStringAsync(cancellationToken), JsonOptions);
        return payload?.Artifacts.FirstOrDefault(artifact =>
            string.Equals(artifact.Name, DhfArtifactName, StringComparison.Ordinal) &&
            !artifact.Expired);
    }

    private async Task<Stream> DownloadArtifactArchiveAsync(
        HttpClient client,
        string archiveDownloadUrl,
        CancellationToken cancellationToken)
    {
        // HttpClient drops the Authorization header when GitHub redirects to the signed blob URL.
        var request = new HttpRequestMessage(HttpMethod.Get, archiveDownloadUrl);
        AddAuthHeaders(request);

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            response.Dispose();
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: artifact download failed.");
        }

        return await response.Content.ReadAsStreamAsync(cancellationToken);
    }

    private void EnsureToken()
    {
        if (string.IsNullOrEmpty(_token))
            throw new InvalidOperationException(
                "GITHUB_TOKEN environment variable is not configured. Set it before starting the API.");
    }

    private void AddAuthHeaders(HttpRequestMessage request)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.Add("Accept", "application/vnd.github+json");
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };
}

public sealed record GitHubArtifactDownload(string FileName, string ContentType, Stream Content);

internal sealed record GitHubWorkflowRunsResponse(IReadOnlyList<GitHubWorkflowRunJson> WorkflowRuns);
internal sealed record GitHubWorkflowRunJson(long Id);
internal sealed record GitHubArtifactsResponse(IReadOnlyList<GitHubArtifactJson> Artifacts);
internal sealed record GitHubArtifactJson(string Name, bool Expired, string ArchiveDownloadUrl);

public sealed class GitHubArtifactNotFoundException(string message) : Exception(message);
