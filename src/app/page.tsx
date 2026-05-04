export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          WhatsApp Order Tracking
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Project scaffolded. Configure <code className="font-mono">DATABASE_URL</code>{" "}
          in <code className="font-mono">.env</code> to begin.
        </p>
      </div>
    </main>
  );
}
