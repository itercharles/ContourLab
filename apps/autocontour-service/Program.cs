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

// (id, name, type, color, startFraction, endFraction, centerX, centerY, radiusX, radiusY)
sealed record StructureTemplate(
    string Id, string Name, string Type, int[] Color,
    double Start, double End,
    double Cx, double Cy, double Rx, double Ry
);

static class AutoContourProfiles
{
    public static readonly AutoContourModelProfile[] All =
    [
        new(
            "thorax-ct-demo",
            "Thorax CT · TotalSeg-style demo",
            "Produces EXTERNAL, bilateral lungs, and heart draft candidates.",
            "CT", "Thorax",
            ["EXTERNAL", "Lung_L", "Lung_R", "Heart"]
        ),
        new(
            "headneck-ct-demo",
            "Head & Neck CT · TotalSeg-style demo",
            "Produces brain, brainstem, bilateral parotids, mandible, and spinal cord draft candidates.",
            "CT", "Head & Neck",
            ["Brain", "BrainStem", "SpinalCord", "Parotid_L", "Parotid_R", "Mandible"]
        ),
        new(
            "abdomen-ct-demo",
            "Upper Abdomen CT · TotalSeg-style demo",
            "Produces liver, spleen, bilateral kidneys, stomach, and spinal cord draft candidates.",
            "CT", "Upper Abdomen",
            ["Liver", "Spleen", "Kidney_L", "Kidney_R", "Stomach", "SpinalCord"]
        ),
        new(
            "pelvis-ct-demo",
            "Pelvis CT · TotalSeg-style demo",
            "Produces bladder, rectum, bilateral femoral heads, CTV prostate, and spinal cord draft candidates.",
            "CT", "Pelvis",
            ["Bladder", "Rectum", "FemoralHead_L", "FemoralHead_R", "CTV_Prostate", "SpinalCord"]
        ),
    ];
}

static class ProfileTemplates
{
    private static readonly StructureTemplate[] Thorax =
    [
        new("external",  "EXTERNAL", "EXTERNAL", [255, 215,   0], 0.05, 0.95, 0.50, 0.52, 0.45, 0.46),
        new("lung-l",    "Lung_L",   "OAR",      [110, 196, 255], 0.18, 0.68, 0.34, 0.44, 0.16, 0.22),
        new("lung-r",    "Lung_R",   "OAR",      [ 90, 156, 255], 0.18, 0.68, 0.66, 0.44, 0.16, 0.22),
        new("heart",     "Heart",    "OAR",      [255,  85,  85], 0.34, 0.62, 0.54, 0.60, 0.14, 0.16),
    ];

    private static readonly StructureTemplate[] HeadNeck =
    [
        new("brain",       "Brain",      "OAR",      [210, 180, 140], 0.03, 0.52, 0.50, 0.50, 0.42, 0.42),
        new("brainstem",   "BrainStem",  "OAR",      [205, 133,  63], 0.45, 0.65, 0.52, 0.64, 0.08, 0.10),
        new("spinalcord",  "SpinalCord", "OAR",      [255, 255,   0], 0.55, 0.97, 0.50, 0.78, 0.03, 0.03),
        new("parotid-l",   "Parotid_L",  "OAR",      [255, 160,  80], 0.58, 0.82, 0.27, 0.52, 0.08, 0.09),
        new("parotid-r",   "Parotid_R",  "OAR",      [255, 200, 100], 0.58, 0.82, 0.73, 0.52, 0.08, 0.09),
        new("mandible",    "Mandible",   "OAR",      [200, 200, 200], 0.70, 0.88, 0.50, 0.34, 0.22, 0.08),
    ];

    private static readonly StructureTemplate[] Abdomen =
    [
        new("liver",      "Liver",      "OAR",      [210, 105,  30], 0.08, 0.62, 0.65, 0.52, 0.22, 0.28),
        new("spleen",     "Spleen",     "OAR",      [148,   0, 211], 0.08, 0.48, 0.30, 0.65, 0.10, 0.12),
        new("kidney-l",   "Kidney_L",   "OAR",      [255, 140,   0], 0.30, 0.70, 0.30, 0.70, 0.08, 0.12),
        new("kidney-r",   "Kidney_R",   "OAR",      [255, 165,  60], 0.25, 0.65, 0.70, 0.70, 0.08, 0.12),
        new("stomach",    "Stomach",    "OAR",      [144, 238, 144], 0.15, 0.55, 0.42, 0.46, 0.12, 0.10),
        new("spinalcord", "SpinalCord", "OAR",      [255, 255,   0], 0.05, 0.92, 0.50, 0.80, 0.03, 0.03),
    ];

    private static readonly StructureTemplate[] Pelvis =
    [
        new("bladder",      "Bladder",      "OAR",      [ 50, 150, 255], 0.18, 0.55, 0.50, 0.35, 0.14, 0.12),
        new("rectum",       "Rectum",       "OAR",      [139,  69,  19], 0.30, 0.82, 0.50, 0.74, 0.06, 0.10),
        new("fh-l",         "FemoralHead_L","OAR",      [192, 192, 192], 0.55, 0.90, 0.20, 0.52, 0.07, 0.07),
        new("fh-r",         "FemoralHead_R","OAR",      [169, 169, 169], 0.55, 0.90, 0.80, 0.52, 0.07, 0.07),
        new("ctv-prostate", "CTV_Prostate", "CTV",      [255,  50,  50], 0.38, 0.62, 0.50, 0.60, 0.07, 0.06),
        new("spinalcord",   "SpinalCord",   "OAR",      [255, 255,   0], 0.02, 0.35, 0.50, 0.78, 0.03, 0.03),
    ];

    public static StructureTemplate[] GetFor(string profileId) => profileId switch
    {
        "headneck-ct-demo" => HeadNeck,
        "abdomen-ct-demo"  => Abdomen,
        "pelvis-ct-demo"   => Pelvis,
        _                  => Thorax,
    };
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

        var templates = ProfileTemplates.GetFor(profile.Id);
        var structures = templates.Select(t => BuildStructure(
            id: t.Id,
            name: t.Name,
            type: t.Type,
            color: t.Color,
            contours: CreateEllipticalContours(
                slices, request.Series,
                startFraction: t.Start, endFraction: t.End,
                centerXFraction: t.Cx, centerYFraction: t.Cy,
                radiusXFraction: t.Rx, radiusYFraction: t.Ry
            )
        )).ToList();

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
    // Demo service: jobs live for the process lifetime and are discarded on restart.
    // There is intentionally no eviction policy yet.
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
