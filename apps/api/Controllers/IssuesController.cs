using Microsoft.AspNetCore.Mvc;
using ContourLab.Api.Services;

namespace ContourLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class IssuesController : ControllerBase
{
    private readonly GitHubService _github;

    public IssuesController(GitHubService github) => _github = github;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateIssueRequest request)
    {
        try
        {
            var body = $"**Priority:** {request.Priority}\n**Category:** {request.Category}\n\n{request.Description}";
            var labels = new[]
            {
                "cr:feedback",
                $"priority:{request.Priority.ToLowerInvariant()}",
                $"category:{request.Category.ToLowerInvariant()}"
            };
            var result = await _github.CreateIssueAsync(request.Title, body, labels);
            return StatusCode(StatusCodes.Status201Created, new { result.Number, result.HtmlUrl });
        }
        catch (InvalidOperationException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (HttpRequestException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        try
        {
            var items = await _github.ListIssuesAsync();
            return Ok(new { items });
        }
        catch (InvalidOperationException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (HttpRequestException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }
}

public sealed record CreateIssueRequest(string Title, string Description, string Priority, string Category);
