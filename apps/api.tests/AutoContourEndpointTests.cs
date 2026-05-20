using System.Net;
using System.Net.Http;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ContourLab.Api.Tests;

public class AutoContourEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact(DisplayName = "GET /api/autocontour/models proxies the configured service response")]
    public async Task ListModels_ProxiesServiceResponse()
    {
        using var client = CreateClient((request, _) =>
        {
            if (request.RequestUri?.AbsolutePath == "/models")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = Json("""
                        [
                          {
                            "id": "thorax-ct-demo",
                            "displayName": "Thorax CT · TotalSeg-style demo",
                            "summary": "Deterministic contour draft generator.",
                            "modality": "CT",
                            "anatomyScope": "Thorax",
                            "expectedStructureLabels": ["EXTERNAL", "Lung_L"]
                          }
                        ]
                        """)
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        });

        var response = await client.GetAsync("/api/autocontour/models");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("thorax-ct-demo", body);
    }

    [Fact(DisplayName = "POST /api/autocontour/jobs rejects non-CT series before forwarding")]
    public async Task CreateJob_RejectsNonCtSeries()
    {
        using var client = factory.CreateClient();
        const string payload = """
            {
              "modelProfileId": "thorax-ct-demo",
              "series": {
                "seriesUID": "series-1",
                "studyInstanceUID": "study-1",
                "modality": "MR",
                "dimensions": [16, 16, 4],
                "spacing": [1, 1, 2],
                "origin": [0, 0, 0],
                "directionCosines": [1, 0, 0, 0, 1, 0, 0, 0, 1],
                "windowCenter": 40,
                "windowWidth": 400,
                "pixelData": [0, 1, 2, 3],
                "slices": []
              }
            }
            """;

        var response = await client.PostAsync(
            "/api/autocontour/jobs",
            new StringContent(payload, Encoding.UTF8, "application/json")
        );

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("CT series only", await response.Content.ReadAsStringAsync());
    }

    [Fact(DisplayName = "GET /api/autocontour/jobs/{jobId}/result returns the proxied structure-set payload")]
    public async Task GetJobResult_ProxiesResultPayload()
    {
        using var client = CreateClient((request, _) =>
        {
            if (request.RequestUri?.AbsolutePath == "/jobs/job-1/result")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = Json("""
                        {
                          "structureSet": {
                            "id": "ai-series-1",
                            "label": "Thorax CT · TotalSeg-style demo draft",
                            "referencedSeriesUID": "series-1",
                            "version": 1,
                            "source": {
                              "type": "ai-draft",
                              "label": "AI draft",
                              "modelDisplayName": "Thorax CT · TotalSeg-style demo",
                              "generatedAt": "2026-05-20T10:00:01.000Z"
                            },
                            "structures": [
                              {
                                "id": "heart",
                                "name": "Heart",
                                "type": "OAR",
                                "color": [255, 85, 85],
                                "contours": [
                                  {
                                    "referencedSOPInstanceUID": "sop-1",
                                    "slicePosition": 10.0,
                                    "points": [0, 0, 10, 1, 0, 10, 1, 1, 10],
                                    "isClosed": true
                                  }
                                ],
                                "volumeCc": 12.4,
                                "isLocked": false,
                                "isVisible": true
                              }
                            ]
                          }
                        }
                        """)
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        });

        var response = await client.GetAsync("/api/autocontour/jobs/job-1/result");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"type\":\"ai-draft\"", body);
        Assert.Contains("\"name\":\"Heart\"", body);
    }

    private HttpClient CreateClient(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
    {
        return factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.AddHttpClient("autocontour")
                    .ConfigurePrimaryHttpMessageHandler(() => new StubHttpMessageHandler(handler))
                    .ConfigureHttpClient(client => client.BaseAddress = new Uri("http://stub.local"));
            });
        }).CreateClient();
    }

    private static StringContent Json(string value)
        => new(value, Encoding.UTF8, "application/json");
}

internal sealed class StubHttpMessageHandler(
    Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler
) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => handler(request, cancellationToken);
}
