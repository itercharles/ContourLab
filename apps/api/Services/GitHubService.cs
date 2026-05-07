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

    public GitHubService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _token = configuration["GITHUB_TOKEN"];
        _repo = configuration["GITHUB_REPO"] ?? "itercharles/WebTPS";
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
            $"/repos/{_repo}/issues?state=open&per_page=50");
        AddAuthHeaders(request);

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"GitHub API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

        var issues = JsonSerializer.Deserialize<GitHubIssueJson[]>(
            await response.Content.ReadAsStringAsync(), JsonOptions) ?? [];
        return issues.Where(i => i.PullRequest is null).Select(MapToItem).ToList();
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
        var stage = DetermineStage(labelNames);
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
