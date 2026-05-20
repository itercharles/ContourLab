using System.Net;
using System.Net.Http.Json;
using ContourLab.Api.Models;

namespace ContourLab.Api.Services;

public sealed class AutoContourServiceClient(IHttpClientFactory httpClientFactory)
{
    public async Task<IReadOnlyList<AutoContourModelProfile>> ListModelsAsync(CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("autocontour");
        return await client.GetFromJsonAsync<IReadOnlyList<AutoContourModelProfile>>(
            "/models",
            cancellationToken
        ) ?? [];
    }

    public Task<AutoContourJobCreateResponse> CreateJobAsync(
        AutoContourJobCreateRequest request,
        CancellationToken cancellationToken
    ) => SendAsync<AutoContourJobCreateResponse>(
        HttpMethod.Post,
        "/jobs",
        request,
        cancellationToken
    );

    public Task<AutoContourJobStatus> GetJobStatusAsync(
        string jobId,
        CancellationToken cancellationToken
    ) => SendAsync<AutoContourJobStatus>(
        HttpMethod.Get,
        $"/jobs/{jobId}",
        null,
        cancellationToken
    );

    public Task<AutoContourResultPayload> GetJobResultAsync(
        string jobId,
        CancellationToken cancellationToken
    ) => SendAsync<AutoContourResultPayload>(
        HttpMethod.Get,
        $"/jobs/{jobId}/result",
        null,
        cancellationToken
    );

    private async Task<T> SendAsync<T>(
        HttpMethod method,
        string path,
        object? payload,
        CancellationToken cancellationToken
    )
    {
        var client = httpClientFactory.CreateClient("autocontour");
        using var request = new HttpRequestMessage(method, path);
        if (payload is not null)
        {
            request.Content = JsonContent.Create(payload);
        }

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new AutoContourServiceException(response.StatusCode, detail);
        }

        return await response.Content.ReadFromJsonAsync<T>(cancellationToken)
            ?? throw new InvalidOperationException($"Auto-contour service returned an empty payload for {path}.");
    }
}

public sealed class AutoContourServiceException(HttpStatusCode statusCode, string detail)
    : Exception(string.IsNullOrWhiteSpace(detail) ? $"Auto-contour service request failed with {statusCode}." : detail)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}
