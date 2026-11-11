FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:fe0fd4e93bd2fbb47c883b7a6369e5c8d3db8bf01cdc5981f6ee35fbdf3ff4fb AS build
WORKDIR /src

COPY apps/api/NuGet.config apps/api/
COPY apps/api/api.csproj apps/api/
RUN dotnet restore apps/api/api.csproj

COPY apps/api/ apps/api/
RUN dotnet publish apps/api/api.csproj --configuration Release --output /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:bfd912c83295ce66d4b706ebb8541b9f14259b0e76fbb88b2751f58ce2399d2e AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:4000
EXPOSE 4000
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ContourLab.Api.dll"]
