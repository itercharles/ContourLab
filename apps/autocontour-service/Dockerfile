FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

COPY apps/autocontour-service/ContourLab.AutoContourService.csproj apps/autocontour-service/
RUN dotnet restore apps/autocontour-service/ContourLab.AutoContourService.csproj

COPY . .
RUN dotnet publish apps/autocontour-service/ContourLab.AutoContourService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:4010
EXPOSE 4010
ENTRYPOINT ["dotnet", "ContourLab.AutoContourService.dll"]
