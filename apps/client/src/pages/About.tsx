import { version } from '../../package.json';

const techStack = [
  {
    title: 'Frontend',
    description: 'React 18 + TypeScript with Cornerstone3D for medical image rendering and VTK.js for 3D visualization.',
    items: ['React 18', 'TypeScript', 'Cornerstone3D', 'VTK.js', 'Tailwind CSS'],
  },
  {
    title: 'Backend',
    description: 'ASP.NET Core 10 Web API providing DICOM-web proxying, structure management, and real-time collaboration over WebSocket.',
    items: ['ASP.NET Core 10', 'C#', 'WebSocket'],
  },
  {
    title: 'Infrastructure',
    description: 'Orthanc PACS for DICOM storage and DICOMweb access, containerised with Docker for local and production deployment.',
    items: ['Orthanc PACS', 'Docker'],
  },
];

const standards = [
  { id: 'IEC 62304', name: 'Medical Device Software Lifecycle' },
  { id: 'IEC 82304-1', name: 'Health Software Product Safety' },
  { id: 'ISO 14971', name: 'Risk Management for Medical Devices' },
];

function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900">ContourLab</h1>
          <p className="mt-2 text-lg text-gray-600">
            Browser-based contouring workspace for radiation oncology
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* Description */}
        <section>
          <p className="text-gray-700 leading-relaxed max-w-3xl">
            ContourLab is a browser-based contouring environment for radiation
            oncology teams. It focuses on image review, structure authoring,
            RTSTRUCT import and export, and collaborative contour editing
            without requiring workstation installs.
          </p>
        </section>

        {/* Technology Stack */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Technology Stack
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {techStack.map((stack) => (
              <div
                key={stack.title}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <h3 className="font-semibold text-gray-900 mb-2">
                  {stack.title}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{stack.description}</p>
                <div className="flex flex-wrap gap-2">
                  {stack.items.map((item) => (
                    <span
                      key={item}
                      className="inline-block px-2.5 py-0.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-full"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance Standards */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Compliance Standards
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            ContourLab is developed under a Design History File (DHF) with full
            requirements traceability and compliance with medical device software
            standards. Compliance infrastructure is powered by{' '}
            <a
              href="https://github.com/itercharles/MedHarness"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              MedHarness
            </a>
            {' '}— open-source design-controlled development tooling for medical device and SaMD teams.
          </p>
          <div className="flex flex-wrap gap-3">
            {standards.map((std) => (
              <div
                key={std.id}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="font-semibold text-sm text-gray-900">
                  {std.id}
                </div>
                <div className="text-xs text-gray-500">{std.name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Version */}
        <section className="border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-400">
            ContourLab v{version}
          </p>
        </section>
      </main>
    </div>
  );
}

export default About;
