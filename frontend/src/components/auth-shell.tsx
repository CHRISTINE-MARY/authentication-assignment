export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-5 py-16 lg:min-h-screen">
      {children}
    </main>
  );
}
