FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/api/NuGet.config apps/api/
COPY apps/api/api.csproj apps/api/
RUN dotnet restore apps/api/api.csproj

COPY apps/api/ apps/api/
RUN dotnet publish apps/api/api.csproj --configuration Release --output /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:4000
EXPOSE 4000
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ContourLab.Api.dll"]
