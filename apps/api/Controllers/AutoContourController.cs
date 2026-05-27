using ContourLab.Api.Models;
using ContourLab.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ContourLab.Api.Controllers;

[ApiController]
[Route("api/autocontour")]
public sealed class AutoContourController(
    AutoContourServiceClient autoContourServiceClient,
    ILogger<AutoContourController> logger
) : ControllerBase
{
    [HttpGet("models")]
    public async Task<ActionResult<IReadOnlyList<AutoContourModelProfile>>> ListModels(CancellationToken cancellationToken)
    {
        return Ok(await autoContourServiceClient.ListModelsAsync(cancellationToken));
    }

    [HttpPost("jobs")]
    public async Task<ActionResult<AutoContourJobCreateResponse>> CreateJob(
        [FromBody] AutoContourJobCreateRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!string.Equals(request.Series.Modality, "CT", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Auto-contouring currently supports CT series only.");
        }

        if (request.Series.Dimensions.Length != 3 || request.Series.Spacing.Length != 3 || request.Series.Origin.Length != 3)
        {
            return BadRequest("Auto-contouring requires 3D volume dimensions, spacing, and origin.");
        }

        return await ForwardAsync(
            () => autoContourServiceClient.CreateJobAsync(request, cancellationToken)
        );
    }

    [HttpGet("jobs/{jobId}")]
    public Task<ActionResult<AutoContourJobStatus>> GetJobStatus(string jobId, CancellationToken cancellationToken)
        => ForwardAsync(() => autoContourServiceClient.GetJobStatusAsync(jobId, cancellationToken));

    [HttpGet("jobs/{jobId}/result")]
    public Task<ActionResult<AutoContourResultPayload>> GetJobResult(string jobId, CancellationToken cancellationToken)
        => ForwardAsync(() => autoContourServiceClient.GetJobResultAsync(jobId, cancellationToken));

    private async Task<ActionResult<T>> ForwardAsync<T>(Func<Task<T>> action)
    {
        try
        {
            return Ok(await action());
        }
        catch (AutoContourServiceException ex)
        {
            logger.LogWarning(ex, "Auto-contour service request failed with status {StatusCode}", ex.StatusCode);
            return StatusCode((int)ex.StatusCode, ex.Message);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Auto-contour service is unreachable");
            return StatusCode(503, "Auto-contour service is unavailable. Ensure it is running on port 4010.");
        }
        catch (TaskCanceledException ex) when (!ex.CancellationToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Auto-contour service request timed out");
            return StatusCode(504, "Auto-contour service request timed out.");
        }
    }
}
