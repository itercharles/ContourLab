using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<AutoContourJobStore>();

var app = builder.Build();
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    app.Urls.Add("http://127.0.0.1:4010");
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "ContourLab.AutoContourService" }));

app.MapGet("/models", () => Results.Ok(AutoContourProfiles.All));

app.MapPost("/jobs", async (
    AutoContourJobCreateRequest request,
    AutoContourJobStore store,
    ILogger<Program> logger,
    CancellationToken cancellationToken
) =>
{
    if (!string.Equals(request.Series.Modality, "CT", StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest("Auto-contouring currently supports CT series only.");
    }

    var profile = AutoContourProfiles.All.FirstOrDefault(candidate => candidate.Id == request.ModelProfileId);
    if (profile is null)
    {
        return Results.BadRequest($"Unknown auto-contour model profile: {request.ModelProfileId}");
    }

    var job = store.Create(request);
    _ = Task.Run(async () =>
    {
        try
        {
            store.MarkRunning(job.JobId, "Generating contour candidates");
            await Task.Delay(350, cancellationToken);
            var result = AutoContourGenerator.Generate(request, profile);
            store.MarkSucceeded(job.JobId, result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Auto-contour job {JobId} failed", job.JobId);
            store.MarkFailed(job.JobId, ex.Message);
        }
    }, CancellationToken.None);

    return Results.Ok(new AutoContourJobCreateResponse(job.JobId));
});

app.MapGet("/jobs/{jobId}", (string jobId, AutoContourJobStore store) =>
{
    var job = store.Get(jobId);
    return job is null ? Results.NotFound() : Results.Ok(job.Status);
});

app.MapGet("/jobs/{jobId}/result", (string jobId, AutoContourJobStore store) =>
{
    var job = store.Get(jobId);
    if (job is null)
    {
        return Results.NotFound();
    }

    if (!job.Status.ResultAvailable || job.Result is null)
    {
        return Results.BadRequest("Auto-contour job result is not available yet.");
    }

    return Results.Ok(job.Result);
});

app.Run();

static class AutoContourProfiles
{
    public static readonly AutoContourModelProfile[] All =
    [
        new(
            "thorax-ct-demo",
            "Thorax CT · TotalSeg-style demo",
            "Deterministic server-side contour draft generator for CT studies. Produces editable EXTERNAL, Lung_L, Lung_R, and Heart candidates.",
            "CT",
            "Thorax",
            ["EXTERNAL", "Lung_L", "Lung_R", "Heart"]
        )
    ];
}

static class AutoContourGenerator
{
    public static AutoContourResultPayload Generate(
        AutoContourJobCreateRequest request,
        AutoContourModelProfile profile
    )
    {
        var now = DateTimeOffset.UtcNow;
        var slices = ResolveSlices(request.Series);
        if (slices.Count == 0)
        {
            throw new InvalidOperationException("CT series does not contain any slice metadata.");
        }

        var structures = new List<AutoContourStructure>
        {
            BuildStructure(
                id: "external",
                name: "EXTERNAL",
                type: "EXTERNAL",
                color: [255, 215, 0],
                contours: CreateEllipticalContours(
                    slices,
                    request.Series,
                    startFraction: 0.05,
                    endFraction: 0.95,
                    centerXFraction: 0.5,
                    centerYFraction: 0.52,
                    radiusXFraction: 0.45,
                    radiusYFraction: 0.46
                )
            ),
            BuildStructure(
                id: "lung-l",
                name: "Lung_L",
                type: "OAR",
                color: [110, 196, 255],
                contours: CreateEllipticalContours(
                    slices,
                    request.Series,
                    startFraction: 0.18,
                    endFraction: 0.68,
                    centerXFraction: 0.34,
                    centerYFraction: 0.44,
                    radiusXFraction: 0.16,
                    radiusYFraction: 0.22
                )
            ),
            BuildStructure(
                id: "lung-r",
                name: "Lung_R",
                type: "OAR",
                color: [90, 156, 255],
                contours: CreateEllipticalContours(
                    slices,
                    request.Series,
                    startFraction: 0.18,
                    endFraction: 0.68,
                    centerXFraction: 0.66,
                    centerYFraction: 0.44,
                    radiusXFraction: 0.16,
                    radiusYFraction: 0.22
                )
            ),
            BuildStructure(
                id: "heart",
                name: "Heart",
                type: "OAR",
                color: [255, 85, 85],
                contours: CreateEllipticalContours(
                    slices,
                    request.Series,
                    startFraction: 0.34,
                    endFraction: 0.62,
                    centerXFraction: 0.54,
                    centerYFraction: 0.60,
                    radiusXFraction: 0.14,
                    radiusYFraction: 0.16
                )
            ),
        };

        var structureSet = new AutoContourStructureSet(
            Id: $"ai-{request.Series.SeriesUID}-{now.ToUnixTimeSeconds()}",
            Label: $"{profile.DisplayName} draft",
            ReferencedSeriesUID: request.Series.SeriesUID,
            Structures: structures,
            Version: 1,
            Source: new AutoContourStructureSetSource(
                Type: "ai-draft",
                Label: "AI draft",
                ImportedAt: now.ToString("O"),
                GeneratorService: "ContourLab.AutoContourService",
                ModelProfileId: profile.Id,
                ModelDisplayName: profile.DisplayName,
                GeneratedAt: now.ToString("O"),
                StudyInstanceUID: request.Series.StudyInstanceUID,
                SeriesInstanceUID: request.Series.SeriesUID
            )
        );

        return new AutoContourResultPayload(structureSet);
    }

    private static AutoContourStructure BuildStructure(
        string id,
        string name,
        string type,
        int[] color,
        List<AutoContourContourSlice> contours
    )
    {
        return new AutoContourStructure(
            Id: id,
            Name: name,
            Type: type,
            Color: color,
            Contours: contours,
            VolumeCc: EstimateVolumeCc(contours),
            IsLocked: false,
            IsVisible: true
        );
    }

    private static List<AutoContourSeriesSlice> ResolveSlices(AutoContourSeriesPayload series)
    {
        if (series.Slices.Count > 0)
        {
            return series.Slices
                .OrderBy(slice => slice.InstanceNumber)
                .ToList();
        }

        return Enumerable.Range(0, Math.Max(series.Dimensions.ElementAtOrDefault(2), 0))
            .Select(index => new AutoContourSeriesSlice(
                $"generated-sop-{index + 1}",
                series.Origin.ElementAtOrDefault(2) + index * (series.Spacing.Length > 2 ? series.Spacing[2] : 1),
                index + 1
            ))
            .ToList();
    }

    private static List<AutoContourContourSlice> CreateEllipticalContours(
        IReadOnlyList<AutoContourSeriesSlice> slices,
        AutoContourSeriesPayload series,
        double startFraction,
        double endFraction,
        double centerXFraction,
        double centerYFraction,
        double radiusXFraction,
        double radiusYFraction
    )
    {
        var imageWidthMm = series.Spacing[0] * Math.Max(series.Dimensions[0] - 1, 1);
        var imageHeightMm = series.Spacing[1] * Math.Max(series.Dimensions[1] - 1, 1);
        var centerX = series.Origin[0] + imageWidthMm * centerXFraction;
        var centerY = series.Origin[1] + imageHeightMm * centerYFraction;
        var radiusX = Math.Max(series.Spacing[0] * 4, imageWidthMm * radiusXFraction);
        var radiusY = Math.Max(series.Spacing[1] * 4, imageHeightMm * radiusYFraction);
        var startIndex = (int)Math.Floor((slices.Count - 1) * startFraction);
        var endIndex = (int)Math.Ceiling((slices.Count - 1) * endFraction);
        var contourSlices = new List<AutoContourContourSlice>();

        for (var sliceIndex = startIndex; sliceIndex <= endIndex && sliceIndex < slices.Count; sliceIndex++)
        {
            if (sliceIndex < 0) continue;
            var slice = slices[sliceIndex];
            var normalizedPosition = slices.Count <= 1
                ? 0
                : (sliceIndex - startIndex) / (double)Math.Max(endIndex - startIndex, 1);
            var taper = 0.72 + 0.28 * Math.Sin(Math.PI * normalizedPosition);

            contourSlices.Add(new AutoContourContourSlice(
                ReferencedSOPInstanceUID: slice.SopInstanceUID,
                SlicePosition: slice.SliceLocation ?? (series.Origin[2] + sliceIndex * series.Spacing[2]),
                Points: CreateEllipsePoints(
                    centerX,
                    centerY,
                    slice.SliceLocation ?? (series.Origin[2] + sliceIndex * series.Spacing[2]),
                    radiusX * taper,
                    radiusY * taper,
                    24
                ),
                IsClosed: true
            ));
        }

        return contourSlices;
    }

    private static IReadOnlyList<double> CreateEllipsePoints(
        double centerX,
        double centerY,
        double z,
        double radiusX,
        double radiusY,
        int pointCount
    )
    {
        var points = new List<double>(pointCount * 3);
        for (var index = 0; index < pointCount; index++)
        {
            var theta = index * (Math.PI * 2 / pointCount);
            points.Add(centerX + radiusX * Math.Cos(theta));
            points.Add(centerY + radiusY * Math.Sin(theta));
            points.Add(z);
        }

        return points;
    }

    private static double EstimateVolumeCc(IReadOnlyList<AutoContourContourSlice> contours)
    {
        if (contours.Count == 0)
        {
            return 0;
        }

        var areaMm2 = contours
            .Select(contour => EstimateContourArea(contour.Points))
            .DefaultIfEmpty(0)
            .Average();
        var thicknessMm = contours.Count > 1
            ? Math.Abs(contours[^1].SlicePosition - contours[0].SlicePosition) / Math.Max(contours.Count - 1, 1)
            : 1;

        return Math.Round((areaMm2 * thicknessMm * contours.Count) / 1000d, 1);
    }

    private static double EstimateContourArea(IReadOnlyList<double> points)
    {
        if (points.Count < 9)
        {
            return 0;
        }

        double area = 0;
        var pointCount = points.Count / 3;
        for (var index = 0; index < pointCount; index++)
        {
            var next = (index + 1) % pointCount;
            var x1 = points[index * 3];
            var y1 = points[index * 3 + 1];
            var x2 = points[next * 3];
            var y2 = points[next * 3 + 1];
            area += x1 * y2 - x2 * y1;
        }

        return Math.Abs(area) / 2d;
    }
}

sealed class AutoContourJobStore
{
    private readonly ConcurrentDictionary<string, AutoContourJobRecord> _jobs = new();

    public AutoContourJobRecord Create(AutoContourJobCreateRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var jobId = Guid.NewGuid().ToString("N");
        var record = new AutoContourJobRecord(
            JobId: jobId,
            Request: request,
            Status: new AutoContourJobStatus(jobId, "queued", "Queued for processing", now, now, false),
            Result: null
        );
        _jobs[jobId] = record;
        return record;
    }

    public AutoContourJobRecord? Get(string jobId)
        => _jobs.TryGetValue(jobId, out var job) ? job : null;

    public void MarkRunning(string jobId, string progressStage)
        => Update(jobId, status => status with
        {
            State = "running",
            ProgressStage = progressStage,
            UpdatedAt = DateTimeOffset.UtcNow,
        });

    public void MarkSucceeded(string jobId, AutoContourResultPayload result)
    {
        if (!_jobs.TryGetValue(jobId, out var existing))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        _jobs[jobId] = existing with
        {
            Result = result,
            Status = existing.Status with
            {
                State = "succeeded",
                ProgressStage = "Contour draft ready",
                UpdatedAt = now,
                ResultAvailable = true,
            }
        };
    }

    public void MarkFailed(string jobId, string error)
        => Update(jobId, status => status with
        {
            State = "failed",
            ProgressStage = "Job failed",
            UpdatedAt = DateTimeOffset.UtcNow,
            Error = error,
        });

    private void Update(string jobId, Func<AutoContourJobStatus, AutoContourJobStatus> update)
    {
        if (!_jobs.TryGetValue(jobId, out var existing))
        {
            return;
        }

        _jobs[jobId] = existing with
        {
            Status = update(existing.Status)
        };
    }
}

sealed record AutoContourJobRecord(
    string JobId,
    AutoContourJobCreateRequest Request,
    AutoContourJobStatus Status,
    AutoContourResultPayload? Result
);

sealed record AutoContourModelProfile(
    string Id,
    string DisplayName,
    string Summary,
    string Modality,
    string AnatomyScope,
    IReadOnlyList<string> ExpectedStructureLabels
);

sealed record AutoContourSeriesSlice(
    string SopInstanceUID,
    double? SliceLocation,
    int InstanceNumber
);

sealed record AutoContourSeriesPayload(
    string SeriesUID,
    string StudyInstanceUID,
    string? StudyDate,
    string? SeriesDescription,
    string Modality,
    int[] Dimensions,
    double[] Spacing,
    double[] Origin,
    double[] DirectionCosines,
    double WindowCenter,
    double WindowWidth,
    IReadOnlyList<double> PixelData,
    IReadOnlyList<AutoContourSeriesSlice> Slices
);

sealed record AutoContourJobCreateRequest(
    string ModelProfileId,
    AutoContourSeriesPayload Series
);

sealed record AutoContourJobCreateResponse(string JobId);

sealed record AutoContourJobStatus(
    string JobId,
    string State,
    string ProgressStage,
    DateTimeOffset SubmittedAt,
    DateTimeOffset UpdatedAt,
    bool ResultAvailable,
    string? Error = null
);

sealed record AutoContourContourSlice(
    string ReferencedSOPInstanceUID,
    double SlicePosition,
    IReadOnlyList<double> Points,
    bool IsClosed
);

sealed record AutoContourStructure(
    string Id,
    string Name,
    string Type,
    int[] Color,
    IReadOnlyList<AutoContourContourSlice> Contours,
    double? VolumeCc,
    bool? IsLocked,
    bool? IsVisible
);

sealed record AutoContourStructureSetSource(
    string Type,
    string? Label,
    string? ImportedAt,
    string? GeneratorService,
    string? ModelProfileId,
    string? ModelDisplayName,
    string? GeneratedAt,
    string? StudyInstanceUID,
    string? SeriesInstanceUID
);

sealed record AutoContourStructureSet(
    string Id,
    string Label,
    string ReferencedSeriesUID,
    IReadOnlyList<AutoContourStructure> Structures,
    int Version,
    AutoContourStructureSetSource Source
);

sealed record AutoContourResultPayload(AutoContourStructureSet StructureSet);
