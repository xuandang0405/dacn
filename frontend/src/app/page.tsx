import App from "@/components/App";
import { LanguageProvider } from "@/lib/language";
export default function Page() {
  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}
