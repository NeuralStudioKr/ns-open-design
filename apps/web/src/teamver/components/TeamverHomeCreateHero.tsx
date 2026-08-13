// Teamver slide-only Home: single primary CTA that opens the create wizard.
// Replaces the OD freeform HomeHero composer on embed (slideOnlyMvp).

import { useTeamverT } from "../branding/useTeamverT";

type Props = {
  onCreate: () => void;
  disabled?: boolean;
};

export function TeamverHomeCreateHero({ onCreate, disabled }: Props) {
  const t = useTeamverT();
  return (
    <section
      className="teamver-home-create-hero"
      data-testid="teamver-home-create-hero"
      aria-label={t("teamver.homeCreate.title")}
    >
      <h1 className="teamver-home-create-hero-title">{t("teamver.homeCreate.title")}</h1>
      <p className="teamver-home-create-hero-lead">{t("teamver.homeCreate.lead")}</p>
      <button
        type="button"
        className="teamver-home-create-hero-cta"
        data-testid="teamver-home-create-cta"
        disabled={disabled}
        onClick={onCreate}
      >
        <span aria-hidden>+</span>
        {t("teamver.homeCreate.cta")}
      </button>
    </section>
  );
}
