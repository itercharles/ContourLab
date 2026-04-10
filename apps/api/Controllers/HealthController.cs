using Microsoft.AspNetCore.Mvc;

namespace WebTPS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() =>
        Ok(new { status = "ok", service = "webtps-api", timestamp = DateTime.UtcNow });
}
