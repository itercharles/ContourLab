import { RELEASE_NOTES } from './releaseNotesData';

function ReleaseNotes() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900">Release Notes</h1>
          <p className="mt-2 text-lg text-gray-600">
            What's changed in each version of ContourLab
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {RELEASE_NOTES.map((entry) => (
          <div
            key={entry.version}
            className="bg-white rounded-lg border border-gray-200 p-6"
          >
            <div className="flex items-baseline gap-4 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                v{entry.version}
              </h2>
              <span className="text-sm text-gray-500">{entry.date}</span>
            </div>
            <ul className="space-y-2">
              {entry.changes.map((change) => (
                <li key={change} className="flex gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </main>
    </div>
  );
}

export default ReleaseNotes;
