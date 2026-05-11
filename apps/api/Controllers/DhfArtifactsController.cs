using Microsoft.AspNetCore.Mvc;
using WebTPS.Api.Services;

namespace WebTPS.Api.Controllers;

[ApiController]
[Route("api/dhf-artifacts")]
public class DhfArtifactsController : ControllerBase
{
    private readonly GitHubService _github;

    public DhfArtifactsController(GitHubService github) => _github = github;

    [HttpGet("latest")]
    public async Task<IActionResult> DownloadLatest(CancellationToken cancellationToken)
    {
        try
        {
            var artifact = await _github.DownloadLatestDhfArtifactAsync(cancellationToken);
            return File(artifact.Content, artifact.ContentType, artifact.FileName);
        }
        catch (GitHubArtifactNotFoundException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status404NotFound);
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
