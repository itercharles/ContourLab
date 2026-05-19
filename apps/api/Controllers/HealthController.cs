using Microsoft.AspNetCore.Mvc;

namespace ContourLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() =>
        Ok(new { status = "ok", service = "contourlab-api", timestamp = DateTime.UtcNow });
}
