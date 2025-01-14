export function loadScript(url: string): Promise<Event> {
  return new Promise<Event>((resolve, reject) => {
    const script = document.createElement('script');

    script.onload = resolve;
    script.onerror = reject;
    script.src = url;

    document.body.appendChild(script);
  });
}
