namespace ContourLab.Api.Models;

public sealed record AutoContourModelProfile(
    string Id,
    string DisplayName,
    string Summary,
    string Modality,
    string AnatomyScope,
    IReadOnlyList<string> ExpectedStructureLabels
);

public sealed record AutoContourSeriesSlice(
    string SopInstanceUID,
    double? SliceLocation,
    double? ImagePositionZ,
    int InstanceNumber
);

public sealed record AutoContourSeriesPayload(
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

public sealed record AutoContourJobCreateRequest(
    string ModelProfileId,
    AutoContourSeriesPayload Series
);

public sealed record AutoContourJobCreateResponse(string JobId);

public sealed record AutoContourJobStatus(
    string JobId,
    string State,
    string ProgressStage,
    DateTimeOffset SubmittedAt,
    DateTimeOffset UpdatedAt,
    bool ResultAvailable,
    string? Error = null,
    IReadOnlyList<string>? Warnings = null
);

public sealed record AutoContourContourSlice(
    string ReferencedSOPInstanceUID,
    double SlicePosition,
    IReadOnlyList<double> Points,
    bool IsClosed
);

public sealed record AutoContourStructure(
    string Id,
    string Name,
    string Type,
    int[] Color,
    IReadOnlyList<AutoContourContourSlice> Contours,
    double? VolumeCc,
    bool? IsLocked,
    bool? IsVisible
);

public sealed record AutoContourStructureSetSource(
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

public sealed record AutoContourStructureSet(
    string Id,
    string Label,
    string ReferencedSeriesUID,
    IReadOnlyList<AutoContourStructure> Structures,
    int Version,
    AutoContourStructureSetSource Source
);

public sealed record AutoContourResultPayload(AutoContourStructureSet StructureSet);
