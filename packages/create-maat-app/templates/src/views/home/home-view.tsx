import { useTranslation } from "../../i18n/use-translation";

export function HomeView() {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <h1 className="text-xl">{t("welcome")}</h1>
    </main>
  );
}
