using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WebTPS.Api.Services;

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
        _repo = configuration["GITHUB_REPO"] ?? "itercharles/WebTPS";
        var parts = _repo.Split('/', 2, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2)
            throw new InvalidOperationException($"GITHUB_REPO must be in owner/repo format. Received '{_repo}'.");
        _owner = parts[0];
        _repoName = parts[1];
    }

    public async Task<GitHubIssueResult> CreateIssueAsync(string title, string body, string[] labels)
    {
        EnsureToken();
        var client = _httpClientFactory.CreateClient("github");
        var request = new HttpRequestMessage(HttpMethod.Post, $"/repos/{_repo}/issues");
        AddAuthHeaders(request);
        request.Content = new StringContent(
            JsonSerializer.Serialize(new { title, body, labels }),
            Encoding.UTF8,
            "application/json");

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        var issue = JsonSerializer.Deserialize<GitHubIssueJson>(
            await response.Content.ReadAsStringAsync(), JsonOptions)!;
        return new GitHubIssueResult(issue.Number, issue.HtmlUrl);
    }

    public async Task<IReadOnlyList<GitHubIssueItem>> ListIssuesAsync()
    {
        EnsureToken();
        var client = _httpClientFactory.CreateClient("github");

        var request = new HttpRequestMessage(HttpMethod.Get,
            $"/repos/{_repo}/issues?state=all&labels=cr%3Afeedback&per_page=50&sort=created&direction=desc");
        AddAuthHeaders(request);

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        var issues = JsonSerializer.Deserialize<GitHubIssueJson[]>(
            await response.Content.ReadAsStringAsync(), JsonOptions) ?? [];
        return issues.Where(i => i.PullRequest is null).Select(MapToItem).ToList();
    }

    public async Task<GitHubArtifactDownload> DownloadLatestDhfArtifactAsync(CancellationToken cancellationToken = default)
    {
        EnsureToken();
        var client = _httpClientFactory.CreateClient("github");
        var workflowRuns = await ListSuccessfulMainWorkflowRunsAsync(client, cancellationToken);

        foreach (var run in workflowRuns)
        {
            var artifact = await FindDhfArtifactForRunAsync(client, run.Id, cancellationToken);
            if (artifact is null) continue;

            var bytes = await DownloadArtifactArchiveAsync(client, artifact.ArchiveDownloadUrl, cancellationToken);
            return new GitHubArtifactDownload(
                $"{DhfArtifactName}-run-{run.Id}.zip",
                "application/zip",
                bytes
            );
        }

        throw new GitHubArtifactNotFoundException("No downloadable DHF artifact was found for the latest successful main CI runs.");
    }

    private async Task<IReadOnlyList<GitHubWorkflowRunJson>> ListSuccessfulMainWorkflowRunsAsync(
        HttpClient client,
        CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/repos/{_owner}/{_repoName}/actions/workflows/{CiWorkflowId}/runs" +
            "?branch=main&event=push&status=success&exclude_pull_requests=true&per_page=20");
        AddAuthHeaders(request);

        var response = await client.SendAsync(request, cancellationToken);
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

        var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(cancellationToken)}");

        var payload = JsonSerializer.Deserialize<GitHubArtifactsResponse>(
            await response.Content.ReadAsStringAsync(cancellationToken), JsonOptions);
        return payload?.Artifacts.FirstOrDefault(artifact =>
            string.Equals(artifact.Name, DhfArtifactName, StringComparison.Ordinal) &&
            !artifact.Expired);
    }

    private async Task<byte[]> DownloadArtifactArchiveAsync(
        HttpClient client,
        string archiveDownloadUrl,
        CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, archiveDownloadUrl);
        AddAuthHeaders(request);

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: artifact download failed.");

        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
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

    private static GitHubIssueItem MapToItem(GitHubIssueJson issue)
    {
        var labelNames = issue.Labels.Select(l => l.Name).ToList();
        var stage = issue.State == "closed" ? "deployed" : DetermineStage(labelNames);
        var priority = labelNames
            .FirstOrDefault(l => l.StartsWith("priority:", StringComparison.Ordinal))
            ?.Replace("priority:", "", StringComparison.Ordinal) ?? "medium";
        return new GitHubIssueItem(issue.Number, issue.Title, stage, priority, issue.CreatedAt, issue.HtmlUrl);
    }

    private static string DetermineStage(IEnumerable<string> labels)
    {
        foreach (var label in labels)
        {
            if (label == "cr:stage/code") return "implement";
            if (label == "cr:stage/design") return "design";
            if (label == "cr:stage/spec") return "analyze";
            if (label == "cr:stage/cr") return "open";
        }
        return "open";
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };
}

public sealed record GitHubIssueResult(int Number, string HtmlUrl);
public sealed record GitHubIssueItem(int Number, string Title, string Stage, string Priority, DateTimeOffset CreatedAt, string HtmlUrl);
public sealed record GitHubArtifactDownload(string FileName, string ContentType, byte[] Content);

internal sealed record GitHubIssueJson(
    int Number,
    string Title,
    string HtmlUrl,
    DateTimeOffset CreatedAt,
    string State,
    IReadOnlyList<GitHubLabelJson> Labels,
    object? PullRequest = null  // present on PRs, null on plain issues
);

internal sealed record GitHubLabelJson(string Name);
internal sealed record GitHubWorkflowRunsResponse(IReadOnlyList<GitHubWorkflowRunJson> WorkflowRuns);
internal sealed record GitHubWorkflowRunJson(long Id);
internal sealed record GitHubArtifactsResponse(IReadOnlyList<GitHubArtifactJson> Artifacts);
internal sealed record GitHubArtifactJson(string Name, bool Expired, string ArchiveDownloadUrl);

public sealed class GitHubArtifactNotFoundException(string message) : Exception(message);
