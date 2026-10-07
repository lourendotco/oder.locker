import { useEffect, useRef, useState, type ComponentProps } from "react";
import Lightbox, { type CaptionsRef } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { Provider } from "jotai";
import type { Route } from "./+types/theme";
import { ChatBubble } from "~/components/chat/ChatBubble";
import { useDiscussion } from "~/components/chat/Discussion";
import { Feed, useFeed, useFeedItem } from "~/components/chat/feed";
import { Logo } from "~/components/layout/Logo";
import { PageTransition } from "~/components/layout/PageTransition";
import { MicrophoneIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react";
import { scrollToStart } from "~/lib/scroll";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "oder.locker - this week" }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  await requireUser(request, url);
  return null;
}

const PICTURE_ALT =
  "A woman is sworn in at the Bundestag: she stands at a microphone in front of the German flag with her right hand raised, facing a woman who holds the text of the oath. A man in a suit stands beside them.";

// Two taps closer together than this are a double-tap (zoom), not two taps.
const DOUBLE_TAP_DELAY = 300;

// How long a bubble shows typing dots before its text.
const TYPING_DELAY = 2000;

const ODER_AVATAR = { avatar: <Logo className="size-[24px]" /> };

type ChatBubbleProps = ComponentProps<typeof ChatBubble>;

// The logos have an empty alt: wherever one shows, the name is next to it.
// The colors are text on white and keep to a contrast of 4.5:1.
const AUTHORS = {
  gdp: {
    name: "Gewerkschaft der Polizei",
    avatar: <img src="/gdp_logo.avif" alt="" />,
    color: "var(--color-green-700)",
  },
  dieLinke: {
    name: "Die Linke",
    avatar: <img src="/die_linke_logo.jpg" alt="" className="px-0.5" />,
    color: "var(--color-red-600)",
  },
  cdu: {
    name: "CDU",
    avatar: <img src="cdu_logo.png" alt="" className="-translate-y-px px-1" />,
    color: "var(--color-gray-800)",
  },
  verdi: {
    name: "ver.di - Medienbündnis",
    avatar: <img src="verdi_logo.svg" alt="" className="p-0.5" />,
    color: "rgb(208,44,74)",
  },
  bff: {
    name: "Bundesverband Frauenberatungsstellen und Frauennotrufe",
    avatar: <img src="bff_logo.svg" alt="" className="px-0.5" />,
    color: "#07516c",
  },
  dc: {
    name: "digital courage",
    avatar: <img src="dc_logo.svg" alt="" className="translate-x-0.5 p-1" />,
    color: "var(--color-yellow-700)",
  },
  sussner: {
    name: "Petra Sußner - Verfassungsblog",
    avatar: <img src="sußner_logo.jpg" alt="" className="" />,
    color: "black",
  },
} satisfies Record<string, NonNullable<ChatBubbleProps["author"]>>;

type AuthorId = keyof typeof AUTHORS;

const STATEMENTS: {
  author: AuthorId;
  quotes: {
    text: string;
    /** overrides author's name. */
    name?: string;
    citation?: ChatBubbleProps["citation"];
  }[];
}[] = [
  {
    author: "gdp",
    quotes: [
      {
        text: "Besonders gravierend ist der anhaltende Anstieg bei Straftaten im Zusammenhang mit Darstellungen sexualisierter Gewalt gegen Kinder. In einer Vielzahl dieser Verfahren stellen IP-Adressen in Verbindung mit Portnummern die einzige verwertbare Ermittlungsgrundlage dar. Hinweise werden den Strafverfolgungsbehörden zeitverzögert über internationale Meldestellen oder Kooperationspartner übermittelt. Derzeit besteht ein Vollzugsdefizit. Ohne eine gesetzlich normierte Speicherpflicht sind die relevanten Daten zum Zeitpunkt des Bekanntwerdens der Tat vielfach bereits gelöscht.",
      },
      {
        text: "Auch wenn aus kriminalistischer Sicht eine längere Speicherfrist - etwa von sechs Monaten - wünschenswert gewesen wäre, bewertet die GdP die nun vorgesehene dreimonatige Speicherpflicht als wichtigen und richtigen Einstieg. Entscheidend ist, dass mit der Neuregelung erstmals wieder eine verbindliche Speicherverpflichtung geschaffen wird, die effektive Strafverfolgung im digitalen Raum ermöglicht und zugleich klare rechtliche Grenzen setzt.",
        citation: {
          href: "https://www.gdp.de/Bundesvorstand/Dokumente/Stellungnahmen/2026/Innenpolitik/2026-10-07%20GdP%20StN%20-%20GesE%20IP-Adressspeicherung%20ua_DBT-Recht%20Anh%C3%B6rung_final.pdf",
          title:
            "Stellungnahme der Gewerkschaft der Polizei (GdP) zum Gesetzentwurf der Bundesregierung - Entwurf eines Gesetzes zur Einführung einer IP-Adressspeicherung und Weiterentwicklung der Befugnisse zur Datenerhebung im Strafverfahren",
          type: "pdf",
        },
      },
    ],
  },
  {
    author: "dieLinke",
    quotes: [
      {
        name: "Anne-Mieke Bremer - Die Linke",
        text: "Leider wird dieser Gesetzentwurf Betroffenen von digitaler Gewalt nicht helfen. Der Fokus auf Strafrecht schützt niemanden. Auch Vergewaltigung steht seit Jahrzehnten unter Strafe und dennoch werden die wenigsten verurteilt. Zudem werden im zivilrechtlichen Teil Betroffene durch einen mehrstufigen Auskunfts- und Abmahnprozess geschickt, bevor sie überhaupt geschützt werden. Und der Preis dafür ist die Wiedereinführung der Vorratsdatenspeicherung: mit der geplanten Speicherung der IP-Adressen wird die Anonymität im Netz für alle gefährdet.",
      },
      {
        name: "Anne-Mieke Bremer - Die Linke",
        text: "Die Betroffenen brauchen kein langwieriges zivilrechtliches Verfahren, sondern einen sofortigen Stopp der Gewalt, wenn sie stattfindet. Sie brauchen Schutz und das Gefühl, ernst genommen zu werden. Dafür notwendig sind verpflichtende Weiterbildungen für Polizei und Justiz sowie eine angemessene Ausstattung von Gewaltschutz- und Beratungsstellen.",
        citation: {
          href: "https://www.dielinkebt.de/presse/pressemitteilungen/detail/digitale-gewalt-hubigs-gesetzentwurf-hilft-betroffenen-nicht/",
          title:
            "Digitale Gewalt: Hubigs Gesetzentwurf hilft Betroffenen nicht",
        },
      },
    ],
  },
  {
    author: "cdu",
    quotes: [
      {
        text: "Die Kriminalität im Netz wächst: Kinderpornographie, organisierter Drogenhandel über Darknet-Plattformen, selbst die Planung von Terroranschlägen – all das hinterlässt digitale Spuren, die mit der IP-Adresse beginnen. Gerade Kinderpornographie ist eines der schlimmsten Verbrechen, die das Strafrecht kennt. Täter müssen schnell aufgespürt, gestoppt und konsequent bestraft werden. Nur so kann jahrelange Hilflosigkeit gegenüber dem vermeintlich anonymen Täter enden. Nur so können Kinder aus den Händen ihrer Schänder geholt werden.",
      },
      {
        name: "Günter Krings - CDU",
        text: "Datenschutz darf nicht zum Täterschutz werden.",
        citation: {
          href: "https://www.cdu.de/aktuelles/digitalpolitik/sicherheit-im-netz-ip-adressen-speichern/",
          title: "Sicherheit im Netz: IP-Adressen speichern!",
        },
      },
    ],
  },
  {
    author: "verdi",
    quotes: [
      {
        text: "Der Entwurf verringert das Schutzniveau für journalistische Berufsgeheimnisträger in Deutschland und stößt damit auf erhebliche verfassungsrechtliche Bedenken. Die Presse- und Rundfunkfreiheit schützt journalistische Tätigkeit von der Beschaffung von Informationen bis zur Verbreitung der Nachricht und der Meinung.",
      },
      {
        text: "Mit der weiter zunehmenden Digitalisierung werden immer mehr Strafverfolgungsmaßnahmen in den digitalen Raum verlagert, wo gleichzeitig immer mehr journalistische Recherchen und Kommunikation stattfindet. All dies kann dazu führen, dass Journalist:innen von etwaigen Investigativ-Recherchen insbesondere zu Missständen in Behörden Abstand nehmen. Auch ist zu befürchten, dass potenzielle Quellen aus Angst vor der Identifikation von einer Kontaktaufnahme zu Journalist:innen absehen (chilling effect).",
      },
      {
        text: "Das Medienbündnis beanstandet außerdem, dass mit der Erhebung von Nutzungsdaten bei einem digitalen Dienst auch Rechercheinhalte von Journalist:innen als Nachrichtenmittler erhoben werden können. Wenn nach dem bisherigen § 100g Abs. 4 StPO journalistische Berufsgeheimnisträger schon bei der Verkehrsdatenerhebung geschützt sind, dann sollte sich das Verbot erst recht auf die Nutzungsdatenerhebung beziehen, da die Nutzungsdaten im Gegensatz zu den Verkehrsdaten auch detaillierte Rechercheinhalte umfassen können.",
        citation: {
          href: "https://www.verdi.de/medien/stellungnahme-zur-vorratsdatenspeicherung",
          title:
            "Stellungnahme zum Referentenentwurf „Gesetz zur Einführung einer IP-Adressspeicherung und Weiterentwicklung der Befugnisse zur Datenerhebung im Strafverfahren“",
        },
      },
    ],
  },
  {
    author: "bff",
    quotes: [
      {
        text: "Zwar verfolgt die Maßnahme das legitime Ziel, die Identifizierung von Tätern zu erleichtern. In der Praxis bestehen jedoch erhebliche Zweifel an ihrer Wirksamkeit. In vielen Fällen, in denen Tatpersonen unerkannt bleiben wollen, nutzen sie technische Möglichkeiten zur Verschleierung, etwa durch VPN-Dienste, geteilte Netzwerke oder öffentliche WLAN-Zugänge.",
      },
      {
        text: "Die anlasslose Speicherung von IP-Adressen von Nutzerinnen bedeutet einen weitreichenden Eingriff in die Rechte aller Internet-Nutzerinnen, ohne dass sich daraus ein verlässlicher Schutzgewinn für Betroffene ergibt. Gerade für Betroffene geschlechtsspezifischer Gewalt ist die Möglichkeit, sich anonym im Netz zu bewegen, oft existenziell, da sie Schutz vor weiterer Überwachung, Kontrolle und Eskalation durch (Ex-)Partner oder andere Täter bietet und überhaupt erst den Zugang zu Information, Beratung und Unterstützung eröffnet.",
      },
      {
        text: "Die Praxis zeigt jedoch, dass solche Auskunftsansprüche für viele Betroffene nicht im Zentrum ihrer Bedürfnisse stehen. In akuten Gewaltsituationen geht es Betroffenen in erster Linie darum, die Gewalt schnell zu stoppen: also Inhalte entfernen zu lassen, Kontaktmöglichkeiten zu unterbinden oder weitere Übergriffe zu verhindern. Die Identifizierung von Tätern und die Durchsetzung von Ansprüchen treten häufig erst in einem späteren Schritt in den Vordergrund, wenn überhaupt.",
        citation: {
          href: "https://www.streit-fem.de/archiv/stellungnahme-zum-entwurf-eines-gesetzes-zur-staerkung-des-zivilrechtlichen-und-strafrechtlichen-schutzes-vor-digitaler-gewalt",
          title:
            "Stellungnahme zum Entwurf eines Gesetzes zur Stärkung des zivilrecht­lichen und strafrechtlichen Schutzes vor digitaler Gewalt",
        },
      },
    ],
  },
  {
    author: "dc",
    quotes: [
      {
        text: "Den Entwurf des BMJV für ein Gesetz zur Einführung einer IP-Adressspeicherung und Weiterentwicklung der Befugnisse zur Datenerhebung im Strafverfahren interpretiert Digitalcourage als einen erneuten Vorstoß im Sinne einer umfangreichen und anlasslosen Vorratsdatenspeicherung. Mit ihm stellt die Bundesregierung die gesamte Bevölkerung unter einen Generalverdacht und greift massiv in die Persönlichkeitsrechte des Einzelnen ein.",
      },
      {
        text: "Statt einer pauschalen Speicherung diverser Verbindungsdaten schlägt Digitalcourage das sogenannte Quick-Freeze-Verfahren vor. Bei dem Verfahren können Strafverfolger die Speicherung von Daten veranlassen um zu verhindern, dass die Daten in der Zwischenzeit gelöscht werden. Dadurch wird die routinemäßige Löschung der Daten unterbunden; die Daten werden „eingefroren“. Sobald ein richterlicher Beschluss vorliegt, ist dann die Nutzung der Daten erlaubt, sie werden wieder „aufgetaut“ und der Strafverfolgungsbehörde ausgehändigt. Quick Freeze ist rechtsstaatlich, verhältnismäßig und bereits heute möglich.",
        citation: {
          href: "https://digitalcourage.de/blog/2026/stellungnahme-geplante-vorratsdatenspeicherung",
          title: "Stellungnahme zur geplanten Vorratsdatenspeicherung",
        },
      },
    ],
  },
  {
    author: "sussner",
    quotes: [
      {
        text: "Bereits an dieser Stelle ergeben sich grundrechtliche Schwierigkeiten mit § 2 GgdG-E. Über die Integration von Portnummern und Zeitstempel […] ermöglicht die Bestimmung nicht nur die Identifikation von Geräten im mobilen Netz und öffentlichen WLAN, sondern auch eine Erstellung von Standort- und Bewegungsprofilen.",
      },
      {
        text: "Auch dem Gesetzesentwurf ist nicht zu entnehmen, dass eine Zuordnung zur Bekämpfung schwerer Kriminalität und Verhütung schwerer Bedrohungen der öffentlichen Sicherheit maßgebliches Aufzählungskriterium gewesen wäre. Vielmehr ist als entscheidend ausgewiesen, dass die „genannten Straftaten häufig im digitalen Raum begangen [werden] und eine besondere Nähe zum allgemeinen Persönlichkeitsrecht [aufweisen]“. Im Ergebnis dürfte das verfolgte Gemeinwohlziel daher (zumindest auch) die Bekämpfung von Straftaten im Allgemeinen sein. Eine grundrechtskonforme Zweck-Mittel-Relation dürfte der Gesetzesentwurf verfehlen.",
        citation: {
          href: "https://verfassungsblog.de/vorratsdatenspeicherung/",
          title:
            "In wessen Namen?: Zur Verknüpfung von Gewaltschutz und IP-Adressspeicherung",
        },
      },
    ],
  },
];

const reveal = (shown: boolean) =>
  `transition-[translate,opacity] delay-1500 duration-2000 motion-reduce:transition-[opacity] ${shown ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`;

function Voice({ id }: { id: AuthorId }) {
  const { active, finish } = useFeedItem({ kind: "voice", id });
  const quotes = STATEMENTS.filter(({ author }) => author === id).flatMap(
    ({ quotes }, i) =>
      quotes.map((quote, j) => ({
        ...quote,
        key: `${i}-${j}`,
        lastInGroup: j === quotes.length - 1,
      })),
  );

  // How many of them have been typed out. The one after those shows typing
  // dots and the rest wait their turn.
  const [typed, setTyped] = useState(0);
  const isTyping = active && typed < quotes.length;

  useEffect(() => {
    if (!isTyping) return;
    const timer = setTimeout(
      () => setTyped((typed) => typed + 1),
      TYPING_DELAY,
    );
    return () => clearTimeout(timer);
  }, [typed, isTyping]);

  useEffect(() => {
    if (typed === quotes.length) finish();
  }, [typed]);

  return (
    // A live region, so each quote is read out as it is typed: nothing else
    // tells a screen reader that picking a voice added something.
    <div
      id={`voice-${id}`}
      aria-live="polite"
      className="flex scroll-mt-(--header-height) flex-col gap-2"
    >
      {quotes.map(
        ({ key, text, name, citation, lastInGroup }, i) =>
          active &&
          i <= typed && (
            <ChatBubble
              key={key}
              author={{ ...AUTHORS[id], ...(name && { name }) }}
              lastInGroup={lastInGroup || i === typed}
              typing={i === typed}
              onTyped={() =>
                scrollToStart(document.getElementById(`voice-${id}`))
              }
              // The statements and their sources are German.
              citation={citation && { ...citation, lang: "de" }}
            >
              <blockquote lang="de" cite={citation?.href}>
                <p>{text}</p>
              </blockquote>
            </ChatBubble>
          ),
      )}
    </div>
  );
}

function DiscussInvite() {
  const { active, finish } = useFeedItem({ kind: "discuss" });
  const { discussing, start } = useDiscussion();

  // Nothing to wait for: whatever follows can start right away.
  useEffect(() => {
    if (active) finish();
  }, [active]);

  return (
    <div
      inert={!active}
      className={`mt-3 -mr-1 pl-2 text-sm text-gray-700 ${reveal(active)}`}
    >
      <p>
        If you would like to, you can add another live user to this
        conversation, and chat with them about this quote. Click the microphone
        to start discussing. Or add them later through the button in the corner,
        by picking the first option.
      </p>
      <button
        type="button"
        aria-label="Discuss with another user"
        // One discussion at a time.
        disabled={discussing}
        onClick={start}
        className="gray-800 mx-auto my-3 block rounded-full bg-secondary p-3 text-white shadow-xs shadow-black transition-[scale,opacity] active:scale-95 disabled:opacity-40"
      >
        <MicrophoneIcon aria-hidden size={60} className="" weight="fill" />
      </button>
    </div>
  );
}

export default function Theme({}: Route.ComponentProps) {
  return (
    <Provider>
      <ThemeChat />
    </Provider>
  );
}

function ThemeChat() {
  const [emojis, setEmojis] = useState(["👍", "👎", "😐", "🤷"]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // How far the chat's opening is: 1 the question is being typed, 2 the
  // summary is being typed, 3 done.
  const [intro, setIntro] = useState(1);

  useEffect(() => {
    if (intro === 3) return;
    const timer = setTimeout(
      () => setIntro((intro) => intro + 1),
      TYPING_DELAY,
    );
    return () => clearTimeout(timer);
  }, [intro]);

  const afterIntro = reveal(intro === 3);

  const { entries, append } = useFeed();
  const { discussing, start } = useDiscussion();
  const voicesDialog = useRef<HTMLDialogElement>(null);
  // The voice just picked in the dialog. Its row stays there to animate shut
  // (see .voice-pop-out), then the dialog closes.
  const [picked, setPicked] = useState<AuthorId | null>(null);
  const addableVoices = (Object.keys(AUTHORS) as AuthorId[]).filter(
    (id) => !entries.some((entry) => entry.kind === "voice" && entry.id === id),
  );
  // Whether a voice is in the chat already. The one just picked doesn't count
  // yet, so the list doesn't shift while its row animates shut.
  const hasVoice = entries.some(
    (entry) => entry.kind === "voice" && entry.id !== picked,
  );
  const captionsRef = useRef<CaptionsRef>(null);
  const captionToggleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  return (
    <PageTransition>
      {/* The side gutters are in px, not rem, so they don't grow with the
          default font size (see ChatBubble). */}
      <div className="-mx-2.5 -mt-2 flex flex-1 flex-col gap-2 pt-5 pr-[36px] pb-10 pl-[6px]">
        <div className="-mr-[36px] -ml-[6px] pb-2 text-[13px] font-medium text-gray-700">
          <h1
            id="page-title"
            className="mx-auto w-fit rounded bg-white px-1 text-lg shadow-xs"
          >
            This week
          </h1>
        </div>
        <ChatBubble bleed>
          <figure>
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary"
            >
              <img
                src="/5025232.webp"
                alt={PICTURE_ALT}
                width={900}
                height={604}
                className="block w-full"
              />
              <span className="sr-only">View full screen</span>
            </button>
            <figcaption className="text-center text-[10px] leading-[1.3]">
              © Deutscher Bundestag / Thomas Imo / phototek
            </figcaption>
          </figure>
        </ChatBubble>
        {/* A live region, so the opening is read out as it is typed. */}
        <div aria-live="polite" className="flex flex-col gap-2">
          <ChatBubble
            author={ODER_AVATAR}
            // Has the avatar while it is the last one there.
            lastInGroup={intro === 1}
            typing={intro === 1}
            emojis={emojis}
            onReact={
              (emoji) =>
                setEmojis((emojis) =>
                  emojis.includes(emoji) ? emojis : [...emojis, emoji],
                )
              // this should actually merge emojis which just vary by skin color (picking which to display?)
            }
          >
            <p className="font-medium">
              Should internet providers be required to store everyone’s IP
              address for three months so police can identify people suspected
              of crimes online?
            </p>
          </ChatBubble>
          {intro >= 2 && (
            <ChatBubble
              author={ODER_AVATAR}
              citation={{
                href: "https://dserver.bundestag.de/btd/21/065/2106581.pdf",
                title:
                  "Entwurf eines Gesetzes zur Einführung einer IP-Adressspeicherung und Weiterentwicklung der Befugnisse zur Datenerhebung im Strafverfahren",
                type: "pdf",
                lang: "de"
              }}
              lastInGroup
              typing={intro === 2}
            >
              <p>
                The German government wants internet providers to store
                customers’ IP addresses for three months so police can later
                identify which connection was used online. Germany has
                introduced data-retention laws twice before: the Federal
                Constitutional Court struck down the 2007 law in 2010, and the
                2015 rules were later found incompatible with EU law by the
                Court of Justice of the European Union, with German courts
                following that ruling. The new proposal is narrower and focuses
                mainly on IP addresses and related connection data.
              </p>
            </ChatBubble>
          )}
          <p
            inert={intro < 3}
            className={`my-3 -mr-1 pl-2 text-sm text-gray-700 ${afterIntro}`}
          >
            Different voices want to join in on the debate. Tap the button in
            the corner to choose who you want to include in your conversation.
          </p>
        </div>
        {intro >= 3 && (
          <button
            type="button"
            aria-label="Add a voice"
            aria-haspopup="dialog"
            onClick={() => voicesDialog.current?.showModal()}
            // Held back as long as the text explaining it (see reveal).
            className="pop-in fixed right-3 bottom-3 z-20 rounded-full bg-primary p-1.5 text-white transition-[scale] [--pop-in-delay:1500ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-95"
          >
            <UserPlusIcon aria-hidden size={40} weight="fill" />
          </button>
        )}
        {/* No padding of its own, so a click whose target is the dialog itself
            landed on the backdrop. m-auto restores the centering Tailwind's
            reset removes. */}
        <dialog
          ref={voicesDialog}
          aria-labelledby="voices-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              event.currentTarget.close();
            }
          }}
          onClose={() => {
            if (picked) {
              scrollToStart(document.getElementById(`voice-${picked}`));
            }
            setPicked(null);
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-xs overflow-hidden rounded-2xl bg-white font-grotesk text-black shadow-xl transition-[opacity,scale] duration-200 ease-out backdrop:bg-black/40 motion-reduce:transition-[opacity] starting:open:scale-95 starting:open:opacity-0"
        >
          <div className="flex max-h-[min(32rem,80dvh)] flex-col">
            <div className="flex items-center gap-2 bg-tertiary/50 py-2 pr-2 pl-4">
              <h2
                id="voices-title"
                className="flex-1 font-space text-base font-medium"
              >
                Add a voice
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => voicesDialog.current?.close()}
                className="flex size-9 items-center justify-center active:bg-neutral-100"
              >
                <XIcon aria-hidden size={20} weight="bold" />
              </button>
            </div>
            {/* The rows clip their content, so the buttons draw their focus
                ring inside their own box. Inside a button only phrasing
                content is valid, hence the spans. */}
            <ul
              // Safari drops the list semantics of a list without markers.
              role="list"
              className="overflow-y-auto overscroll-contain"
            >
              <li
                hidden={!hasVoice}
                onAnimationEnd={() => voicesDialog.current?.close()}
                className={`grid grid-rows-[1fr]`}
              >
                <div className="min-h-0 overflow-hidden">
                  <button
                    type="button"
                    // One discussion at a time. The block scrolls itself
                    // into view once the dialog is out of the way.
                    disabled={discussing}
                    onClick={() => {
                      start();
                      voicesDialog.current?.close();
                    }}
                    className="flex min-h-12 w-full items-center gap-3 bg-primary pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black active:bg-neutral-100 disabled:opacity-40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-white">
                      <MicrophoneIcon
                        aria-hidden
                        weight="fill"
                        className="text-2xl"
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center py-2 pr-4">
                      <span className="min-w-0 flex-1 leading-[1.25]">
                        <span className="block text-sm font-medium text-white">
                          Discuss with another user
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              </li>
              {(Object.keys(AUTHORS) as AuthorId[])
                .filter((id) => addableVoices.includes(id) || id === picked)
                .map((id) => (
                  // The divider is each row's top border, inside the clipped
                  // inner box so it collapses with the row.
                  <li
                    key={id}
                    inert={id === picked}
                    onAnimationEnd={() => voicesDialog.current?.close()}
                    className={`grid grid-rows-[1fr] ${id === picked ? "voice-pop-out" : ""}`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <button
                        type="button"
                        // The first voice brings the invitation to discuss
                        // with it; append skips readding if it is present.
                        onClick={() => {
                          setPicked(id);
                          append(
                            <Voice key={`voice-${id}`} id={id} />,
                            <DiscussInvite key="discuss" />,
                          );
                        }}
                        className="flex min-h-12 w-full items-center gap-3 border-t border-neutral-200 bg-white pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary active:bg-neutral-100"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-neutral-200">
                          {AUTHORS[id].avatar}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center py-2 pr-4">
                          <span className="min-w-0 flex-1 leading-[1.25]">
                            <span className="line-clamp-2 text-sm font-medium text-black">
                              {AUTHORS[id].name}
                            </span>
                          </span>
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        </dialog>
        <Feed />

        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={[
            {
              src: "/5025232.webp",
              alt: PICTURE_ALT,
              width: 900,
              height: 604,
              description: "© Deutscher Bundestag / Thomas Imo / phototek",
            },
          ]}
          plugins={[Captions, Zoom]}
          captions={{ ref: captionsRef, descriptionTextAlign: "center" }}
          // Same window for mouse as for touch (the mouse default is 500ms).
          zoom={{
            doubleTapDelay: DOUBLE_TAP_DELAY,
            doubleClickDelay: DOUBLE_TAP_DELAY,
          }}
          // A single click on the slide toggles the caption. The toggle waits
          // out the double-tap window, and a second click inside it cancels
          // the toggle, leaving the gesture to Zoom.
          on={{
            click: () => {
              if (captionToggleTimer.current) {
                clearTimeout(captionToggleTimer.current);
                captionToggleTimer.current = undefined;
                return;
              }
              captionToggleTimer.current = setTimeout(() => {
                captionToggleTimer.current = undefined;
                (captionsRef.current?.visible
                  ? captionsRef.current?.hide
                  : captionsRef.current?.show)?.();
              }, DOUBLE_TAP_DELAY);
            },
            // After a swipe to dismiss the library slides the picture back to
            // the centre while the whole lightbox fades out. Skip that fade:
            // the pull offset is still set on the container at this point,
            // which tells a swipe apart from the other ways to close.
            exiting: () => {
              const portal =
                document.querySelector<HTMLElement>(".yarl__portal");
              const pullOffset = portal
                ?.querySelector<HTMLElement>(".yarl__container")
                ?.style.getPropertyValue("--yarl__pull_offset");
              if (portal && pullOffset && parseFloat(pullOffset) !== 0) {
                portal.style.transition = "none";
              }
            },
          }}
          // Replaces the plugin's flat grey bar with a soft fade behind small
          // text, kept clear of the home indicator.
          styles={{
            captionsDescriptionContainer: {
              background: "linear-gradient(transparent, rgb(0 0 0 / 0.65))",
              padding: "40px 16px calc(14px + env(safe-area-inset-bottom))",
            },
            captionsDescription: { fontSize: 12, lineHeight: 1.3 },
          }}
          // A single slide: no prev/next buttons and no swiping to a copy.
          // padding: 0 lets the picture reach the screen edges.
          carousel={{ finite: true, padding: 0 }}
          // Swipe to dismiss. Only active when not zoomed in: Zoom keeps the
          // drag for panning otherwise. The backdrop fade is in app.css.
          controller={{
            closeOnPullUp: true,
            closeOnPullDown: true,
            closeOnBackdropClick: true,
            closeOnEscape: true,
          }}
          render={{
            buttonPrev: () => null,
            buttonNext: () => null,
            // Zoom stays available via pinch, double-tap/click and the wheel.
            buttonZoom: () => null,
          }}
        />
      </div>
    </PageTransition>
  );
}
