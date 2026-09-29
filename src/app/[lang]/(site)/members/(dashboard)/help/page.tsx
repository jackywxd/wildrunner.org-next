import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CircleHelp,
  Flag,
  Images,
  Lightbulb,
  LogIn,
  PenLine,
  UserRound,
  LayoutDashboard,
  Link2,
} from "lucide-react";

import Link from "@/components/i18n/locale-link";
import { HelpClip } from "@/components/members/help/HelpClip";

/**
 * 使用說明 — the members' manual.
 *
 * Every screenshot and clip under public/help was taken from the real member
 * area on a phone-sized screen with a demo account and demo photos, so what a
 * member reads here is what they will see (public/help/README.md says how to
 * retake them). The wording of every button quoted below is copied from the
 * component that draws it; when a label changes, this page has to change
 * with it, which is why the quotes are plain text a search will find.
 *
 * A static page in the members' shell rather than a CMS document: it
 * describes the members' own screens, changes when they change, and belongs
 * in the same review as the change that moves a button.
 */

export const metadata: Metadata = { title: "使用說明" };

const TOC = [
  { id: "sign-in", label: "帳號與登入", icon: LogIn },
  { id: "dashboard", label: "會員中心總覽", icon: LayoutDashboard },
  { id: "profile", label: "個人資料", icon: UserRound },
  { id: "write", label: "寫文章", icon: PenLine },
  { id: "races", label: "比賽紀錄", icon: Flag },
  { id: "link", label: "連結比賽與文章", icon: Link2 },
  { id: "media", label: "媒體庫", icon: Images },
  { id: "faq", label: "常見問題", icon: CircleHelp },
] as const;

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: (typeof TOC)[number]["icon"];
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-4 border-t border-border pt-8" id={id}>
      <h2 className="flex items-center gap-2 font-heading text-2xl font-bold">
        <Icon aria-hidden className="size-6 text-primary" />
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-heading text-lg font-semibold">{children}</h3>;
}

/** Numbered steps, drawn as circles so a reader can find "step 3" again. */
function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {children.map((step, index) => (
        <li className="flex gap-3" key={index}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[9999px] bg-primary text-sm font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5">{step}</div>
        </li>
      ))}
    </ol>
  );
}

function Shot({
  src,
  alt,
  caption,
  wide = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  wide?: boolean;
}) {
  return (
    <figure className="my-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots from public/help; the image loader is for uploaded media */}
      <img
        alt={alt}
        className={
          wide
            ? "mx-auto w-full border border-border"
            : "mx-auto w-full max-w-[300px] border border-border"
        }
        loading="lazy"
        src={src}
      />
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Tip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  const Icon = warn ? AlertTriangle : Lightbulb;
  return (
    <div
      className={
        warn
          ? "flex gap-3 border-l-4 border-l-destructive bg-destructive/5 p-3 text-sm"
          : "flex gap-3 border-l-4 border-l-primary bg-primary/5 p-3 text-sm"
      }
    >
      <Icon
        aria-hidden
        className={warn ? "mt-0.5 size-4 shrink-0 text-destructive" : "mt-0.5 size-4 shrink-0 text-primary"}
      />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/** A button or label exactly as it appears on screen. */
function B({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-block border border-border bg-background px-1.5 text-[0.9em] font-medium">
      {children}
    </span>
  );
}

export default function MemberHelpPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8 pb-16 text-base leading-relaxed" data-testid="member-help">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 font-heading text-3xl font-bold">
          <BookOpen aria-hidden className="size-7 text-primary" />
          使用說明
        </h1>
        <p className="text-muted-foreground">
          寫賽記、登錄比賽、上傳照片——這裡一步一步說明會員中心的每個功能。標著
          <span className="mx-1 inline-flex size-5 items-center justify-center rounded-[9999px] bg-primary align-[-3px] text-primary-foreground">
            ▶
          </span>
          的是短片示範，點一下就會播放，沒有聲音。
        </p>
        <nav aria-label="目錄" className="border border-border bg-secondary p-4">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">目錄</p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {TOC.map(({ id, label, icon: Icon }, index) => (
              <li key={id}>
                <a
                  className="flex min-h-11 items-center gap-2 px-2 hover:bg-background hover:text-primary md:min-h-9"
                  href={`#${id}`}
                >
                  <Icon aria-hidden className="size-4 text-primary" />
                  <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      {/* ───────────────────────────── 1 */}
      <Section icon={LogIn} id="sign-in" title="1. 帳號與登入">
        <p>
          野馬營的帳號採邀請制：由管理員寄出邀請信（主旨「邀請你成為野馬營作者」），信裡的連結
          <strong>7 天內有效、只能用一次</strong>。點開連結、設定密碼（至少 8 個字元）後就會直接登入。
        </p>
        <Steps>
          {[
            <>打開網站右上角的登入圖示，或直接到「會員登入」頁。</>,
            <>
              輸入 <B>電子郵件</B> 和 <B>密碼</B>，按 <B>登入</B>。
            </>,
            <>
              忘記密碼時按 <B>忘記密碼？</B>，填入電子郵件後按 <B>寄出重設連結</B>
              ，再從信裡的連結設定新密碼。連結有時效，過期或已用過會顯示「這個連結已經失效或已經用過了」，重新申請一次即可。
            </>,
          ]}
        </Steps>
        <Shot alt="會員登入頁" caption="會員登入頁" src="/help/login.webp" />
        <Tip>
          <p>登入後 30 天內不必再登入；30 天後會請你重新登入一次。</p>
        </Tip>
      </Section>

      {/* ───────────────────────────── 2 */}
      <Section icon={LayoutDashboard} id="dashboard" title="2. 會員中心總覽">
        <p>登入後會先看到「總覽」。由上到下是：</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            你的頭像和名字，以及 <B>查看我的公開頁面 →</B>——別人在「野馬」名錄裡看到的就是這一頁。
          </li>
          <li>
            「完成你的個人頁」清單：設定頭像、寫一段簡介、登錄第一筆比賽紀錄、發表第一篇文章。做完的會打勾，四項都完成後清單就會消失。
          </li>
          <li>已發布文章、草稿、媒體檔案、比賽紀錄的數量。</li>
          <li>儲存空間用量（預設每人 100 GB）。</li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot alt="會員中心總覽" caption="總覽" src="/help/dashboard.webp" />
          <Shot alt="手機上展開的會員選單" caption="手機上點右上角的選單切換頁面" src="/help/nav-open.webp" />
        </div>
        <p>
          在手機上，右上角的按鈕會顯示目前所在的頁面，點開就能切換到 <B>個人資料</B>、<B>媒體庫</B>、
          <B>文章</B>、<B>比賽紀錄</B> 和這份 <B>使用說明</B>；最下面是 <B>登出</B>
          。在電腦上這些項目固定在左側。點左上角的「會員中心」標誌可以回到網站首頁。
        </p>
      </Section>

      {/* ───────────────────────────── 3 */}
      <Section icon={UserRound} id="profile" title="3. 個人資料">
        <p>「公開身分」這一區會顯示在成員名錄和你的公開頁面上：</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>頭像</strong>：按 <B>上傳頭像</B> 從手機選一張照片，或按 <B>從媒體庫選擇</B>
            。頭像不會出現在相片牆上。還沒設定時，系統會依你的名字產生一個圖案。
          </li>
          <li>
            <strong>別名</strong>：公開顯示的名字，文章署名也用這個。
          </li>
          <li>
            <strong>簡介</strong>：一兩句介紹自己。
          </li>
        </ul>
        <p>
          「帳號」這一區的 <strong>顯示名稱</strong> 只有你自己看得到；電子郵件不能在這裡修改。改完按畫面下方的{" "}
          <B>儲存變更</B>，看到「已儲存」就完成了。
        </p>
        <HelpClip
          duration="0:13"
          poster="/help/profile-poster.webp"
          start={1.25}
          src="/help/profile.webm"
          title="上傳頭像、填寫別名和簡介"
        />
        <Tip>
          <p>
            變更密碼：按 <B>變更密碼</B>，輸入目前的密碼和兩次新密碼，再按 <B>確認變更</B>
            。密碼有自己的確認按鈕，不跟「儲存變更」一起送出。
          </p>
        </Tip>
      </Section>

      {/* ───────────────────────────── 4 */}
      <Section icon={PenLine} id="write" title="4. 寫文章">
        <Sub>4.1 三種開始方式</Sub>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>寫賽記（最常用）</strong>：在「賽事日程」找到你跑過的比賽，按 <B>紀錄比賽</B>
            ；或在總覽清單裡按「發表第一篇文章」。選好組別後按 <B>開始撰寫</B>
            ，系統會同時建立比賽紀錄和一篇已經填好標題、連好比賽的草稿。詳見
            <a className="text-primary underline underline-offset-4" href="#link">
              第 6 節
            </a>
            。
          </li>
          <li>
            <strong>空白文章</strong>：在「文章」頁按 <B>新增文章</B>，會立刻建立一篇名為「未命名文章」的草稿並打開編輯器。
          </li>
          <li>
            <strong>匯入</strong>：已經在別處寫好 Markdown／MDX 的，按 <B>匯入文章</B>
            ，貼上內容或選擇 .md／.mdx 檔，按 <B>解析</B>，確認標題和摘要後按 <B>建立草稿</B>
            。文件裡用網址連結的圖片不會自動匯入，建立後要在編輯器裡補上。
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot alt="文章列表" caption="「文章」頁：草稿、已發布與閱讀次數" src="/help/posts-list.webp" />
          <Shot alt="匯入文章頁" caption="匯入 Markdown／MDX" src="/help/import.webp" />
        </div>

        <Sub>4.2 編輯器由上到下</Sub>
        <Shot alt="文章編輯器上半部" caption="標題、網址代稱、摘要、封面" src="/help/editor-top.webp" />
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>標題</strong>：頁面最上面的大字，直接點下去修改。
          </li>
          <li>
            <strong>網址代稱</strong>：文章網址的最後一段，例如 <code>2026/utmb-whistler-100k</code>
            。留空的話發布時會自動產生；<strong>發布後再改會改變文章網址</strong>，已分享出去的舊連結會失效。
          </li>
          <li>
            <strong>摘要</strong>：顯示在文章列表和分享卡片上。按 <B>AI 產生摘要</B>
            可以讓 AI 根據內文寫一兩句（約 100 字內），滿意再按 <B>使用</B>。
          </li>
          <li>
            <strong>封面圖片</strong>：分享到社群時顯示的圖片。可以 <B>上傳圖片</B> 或 <B>從媒體庫選擇</B>
            ；沒設定時會改用內文第一張圖。
          </li>
          <li>
            <strong>賽事</strong>：這篇是賽記的話，在這裡連結一場比賽，文章上方就會出現徽章（見第 6 節）。
          </li>
        </ul>

        <Sub>4.3 寫內文</Sub>
        <p>
          內文區上方是固定的工具列，往下捲動時會一直停在畫面頂端：<B>復原</B> <B>重做</B>、區塊型別（標題 1–3、內文、引言、清單）、
          <B>粗體</B> <B>斜體</B> <B>底線</B>、<B>圖片</B>、<B>影片</B>、<B>媒體庫</B>、<B>表格</B>。在手機上工具列可以左右滑動。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot alt="編輯器工具列與內文" caption="固定工具列與內文" src="/help/editor-body.webp" />
          <Shot alt="輸入斜線打開的區塊選單" caption="在空白行輸入「/」插入區塊" src="/help/editor-slash.webp" />
        </div>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>「/」選單</strong>：在空白行輸入 <code>/</code>，可以插入標題、小標題、次小標題、清單、引言、分隔線或表格；繼續打字可以篩選。
          </li>
          <li>
            <strong>選取文字</strong>：選起一段字，會出現 <B>粗體</B> <B>斜體</B> <B>底線</B> <B>連結</B> 的小工具列；按「連結」後輸入網址。
          </li>
          <li>
            <strong>Markdown 快捷</strong>：習慣 Markdown 的話可以直接輸入 <code># </code>（標題）、<code>- </code>
            （清單）、<code>&gt; </code>（引言）、<code>**粗體**</code> 等。內文下方的「可以直接用 Markdown 語法輸入」可以展開完整對照表。
          </li>
          <li>
            <strong>圖片</strong>：按 <B>圖片</B> 從手機選照片（可以一次選多張），或按 <B>媒體庫</B>
            挑已經上傳過的；在電腦上也可以直接貼上或拖進來。每張圖上方有 <B>滿版</B> <B>中</B> <B>小</B> 調整寬度，
            <B>刪除</B> 移除。
          </li>
          <li>
            <strong>影片</strong>：按 <B>影片</B> 上傳（單檔最多 1 GB），上傳完成後會插入到游標的位置。
          </li>
          <li>
            <strong>YouTube</strong>：把 YouTube 連結單獨貼成一段，發布後會變成可以播放的影片。
          </li>
          <li>
            <strong>表格</strong>：游標在表格裡時，會出現插入／刪除列與欄的工具列。
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot alt="選取文字後的小工具列" caption="選取文字：粗體、斜體、底線、連結" src="/help/editor-selection.webp" />
          <Shot alt="圖片寬度按鈕" caption="圖片寬度：滿版／中／小" src="/help/editor-image.webp" />
        </div>
        <Shot alt="Markdown 語法對照表" caption="展開「可以直接用 Markdown 語法輸入」看完整對照" src="/help/markdown-hints.webp" />
        <HelpClip
          duration="0:36"
          poster="/help/write-poster.webp"
          start={6}
          src="/help/write.webm"
          title="寫摘要和內文、用「/」加小標題、從媒體庫插入圖片、設定封面、發布"
        />

        <Sub>4.4 AI 小幫手</Sub>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <B>AI 產生摘要</B>：依內文寫一兩句摘要，不會加入內文沒有的事實。
          </li>
          <li>
            <B>AI 完善文章</B>：潤飾句子，保留原意、段落、標題和圖片。會左右（手機上用切換）對照原文與 AI 版本，按 <B>接受</B>{" "}
            會取代整篇內文，按 <B>拒絕</B> 則維持原樣。
          </li>
          <li>
            <B>AI 改錯字</B>：列出可能的錯別字，一項一項按 <B>接受</B> 或 <B>拒絕</B>。
          </li>
        </ul>
        <Tip>
          <p>一次最多處理 12,000 字，每分鐘最多 10 次。圖片還在上傳時請等上傳完成再試。</p>
        </Tip>

        <Sub>4.5 儲存與發布</Sub>
        <p>
          在手機上，儲存和發布的按鈕固定在畫面最下方；左邊會顯示文章狀態：「草稿」或「已發布」，有修改還沒存時會加上「未儲存的變更」。
        </p>
        <Shot alt="畫面底部的儲存與發布列" caption="畫面底部的狀態與按鈕" src="/help/editor-statusbar.webp" />
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>自動儲存</strong>：停止打字約 3 秒後會自動存成草稿（最多每 30 秒一次），顯示「已自動儲存」。
            <strong>自動儲存不會改到已經公開的文章。</strong>
          </li>
          <li>
            <B>預覽</B>：看看發布後在網站上的樣子。
          </li>
          <li>
            <B>儲存草稿</B>：存下來但不公開。
          </li>
          <li>
            <B>發布</B>：公開文章。已發布的文章這顆按鈕會變成 <B>更新已發布內容</B>。
          </li>
          <li>
            <B>取消發布</B>：把已發布的文章收回成草稿。
          </li>
        </ul>
        <Tip>
          <p>
            看到「有未發布的變更」，表示你的修改已經存成草稿，但網站上還是舊版本——記得按 <B>更新已發布內容</B>。
          </p>
        </Tip>
        <p>
          發布後，文章會出現在「文章」列表、你的個人頁和「穿越時光」時間軸上。文章頁有 <B>分享</B>（可以下載分享圖、複製小紅書或微信文案）和{" "}
          <B>列印 / PDF</B>。
        </p>
        <Shot alt="電腦上的編輯器與即時預覽" caption="在電腦上，預覽會和編輯器並排顯示" src="/help/desktop-editor.webp" wide />
        <Tip warn>
          <p>
            刪除文章：在「文章」列表按該篇右邊的 <B>✕</B>，再按 <B>確定刪除</B>。刪除後無法復原；文章連結的比賽紀錄會保留。
          </p>
        </Tip>
      </Section>

      {/* ───────────────────────────── 5 */}
      <Section icon={Flag} id="races" title="5. 比賽紀錄">
        <p>
          登錄你跑過的 UTMB World Series、World Trail Majors、六大馬拉松和其他獨立賽事，每一筆都會變成一面徽章，顯示在成員名錄和你的個人頁上。
        </p>
        <Steps>
          {[
            <>
              在會員選單點 <B>比賽紀錄</B>。
            </>,
            <>
              依序選 <B>系列</B>、<B>賽事</B>、<B>距離</B>（只有一個組別時會自動選好）和 <B>年份</B>。
            </>,
            <>
              <B>完賽狀態</B> 選「完賽」或「未完賽」；完賽的話可以填完賽時間，格式是「時:分:秒」，例如 <code>38:42:15</code>（可以留空）。
            </>,
            <>
              按 <B>新增</B>，紀錄就會出現在下方的「我的紀錄」。
            </>,
          ]}
        </Steps>
        <HelpClip
          duration="0:14"
          poster="/help/race-record-poster.webp"
          start={3}
          src="/help/race-record.webm"
          title="登錄一筆比賽紀錄"
        />
        <Shot alt="我的紀錄列表與徽章" caption="我的紀錄：每一筆都有自己的徽章" src="/help/race-records.webp" />
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>未完賽</strong>也可以登錄，徽章會以灰階顯示。
          </li>
          <li>
            六大馬拉松六場都「完賽」後，會多一面「六大馬拉松」徽章，年份是你完成第六場的那一年。
          </li>
          <li>
            按 <B>修改</B> 可以更正，改完按 <B>儲存</B>。同一場比賽、同一年、同一個距離只能登錄一次。
          </li>
        </ul>
        <Tip warn>
          <p>
            刪除紀錄時，如果有文章連結著這筆紀錄，系統會先提醒「這筆紀錄有 N 篇文章在使用」。確認刪除後，那些文章上的徽章會一起消失（文章本身不受影響）。
          </p>
        </Tip>
      </Section>

      {/* ───────────────────────────── 6 */}
      <Section icon={Link2} id="link" title="6. 連結比賽與文章（寫賽記）">
        <p>把文章連結到一場比賽，文章頂端就會顯示那場比賽的徽章、年份、組別和完賽時間，也會在你的時間軸上合成一列「賽記」。有兩種做法：</p>

        <Sub>做法一：從賽事日程開始（推薦）</Sub>
        <Steps>
          {[
            <>
              到網站的「賽事日程」，找到你跑過、已經結束的比賽。登入後每一列會多出 <B>紀錄比賽</B> 和 <B>上傳相片</B> 兩個按鈕。
            </>,
            <>
              按 <B>紀錄比賽</B>，在「紀錄比賽」頁選好 <B>組別</B>，下方會預覽徽章。
            </>,
            <>
              按 <B>開始撰寫</B>。系統會建立比賽紀錄（已經登錄過的不會重複），並開一篇標題已經填好、比賽已經連好的草稿。
            </>,
          ]}
        </Steps>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot alt="賽事日程中某場比賽的紀錄比賽按鈕" caption="賽事日程：登入後才有「紀錄比賽」" src="/help/races-row.webp" />
          <Shot alt="紀錄比賽頁" caption="選比賽和組別，按「開始撰寫」" src="/help/race-report-start.webp" />
        </div>
        <HelpClip
          duration="0:25"
          poster="/help/race-report-poster.webp"
          start={9}
          src="/help/race-report.webm"
          title="從賽事日程按「紀錄比賽」開始寫賽記"
        />
        <Tip>
          <p>只有已經結束的比賽才能寫賽記。同一場比賽、同一個組別的賽記只能建立一篇，已經寫過的會提醒你到文章列表繼續編輯。</p>
        </Tip>

        <Sub>做法二：在已經寫好的文章裡連結</Sub>
        <Steps>
          {[
            <>
              打開文章，找到「賽事」區塊，按 <B>連結比賽</B>。
            </>,
            <>
              可以從 <B>最近結束的比賽</B> 直接挑，或依序選系列、賽事、距離、年份，下方會預覽徽章。
            </>,
            <>
              按 <B>確定</B>。之後可以按 <B>更換</B> 換一場，或按 <B>移除</B> 取消連結（比賽紀錄會保留）。
            </>,
          ]}
        </Steps>
        <HelpClip
          duration="0:24"
          poster="/help/link-race-poster.webp"
          start={1.5}
          src="/help/link-race.webm"
          title="在文章裡按「連結比賽」"
        />
        <Shot alt="編輯器裡已連結的賽事" caption="連結完成：徽章、賽事名稱與年份，右邊可以更換或移除" src="/help/editor-race.webp" wide />
        <Tip>
          <p>連結時如果你還沒登錄過這場比賽，系統會順便幫你建立比賽紀錄；已經有的就直接沿用。</p>
        </Tip>

        <Sub>連結之後會出現在哪裡</Sub>
        <div className="grid gap-4 sm:grid-cols-3">
          <Shot alt="文章頂端的比賽徽章" caption="文章頂端的比賽資訊" src="/help/article.webp" />
          <Shot alt="個人頁的徽章牆" caption="個人頁的徽章牆" src="/help/rider.webp" />
          <Shot alt="比賽頁的相片牆" caption="比賽頁的相片牆" src="/help/race-wall.webp" />
        </div>
      </Section>

      {/* ───────────────────────────── 7 */}
      <Section icon={Images} id="media" title="7. 媒體庫">
        <p>
          媒體庫收著你上傳過的所有照片和影片：文章插圖、封面、頭像，以及要放上相片牆的照片。
        </p>

        <Sub>7.1 上傳照片和影片</Sub>
        <Steps>
          {[
            <>
              在會員選單點 <B>媒體庫</B>，再按 <B>上傳照片和影片</B>。
            </>,
            <>
              點虛線框選擇檔案（可以一次選很多個；在電腦上也可以直接拖進來）。
            </>,
            <>
              在「這一批的設定」裡：<B>顯示在相片牆</B> 預設打勾，取消的話照片只留在你的媒體庫；如果是某場比賽的照片，選好系列、賽事和年份，這場比賽的相片集就會自動出現。
            </>,
            <>
              按 <B>上傳 N 個檔案</B>。上傳中請不要關閉頁面；完成後可以按 <B>再上傳一批</B> 或 <B>回媒體庫</B>。
            </>,
          ]}
        </Steps>
        <Shot alt="上傳頁與這一批的設定" caption="上傳頁：先選檔，再決定要不要公開、屬於哪場比賽" src="/help/upload-settings.webp" />
        <HelpClip
          duration="0:30"
          poster="/help/upload-poster.webp"
          start={3.5}
          src="/help/upload.webm"
          title="一次上傳六張照片，並標記為威士拿 UTMB 2026"
        />
        <Tip>
          <p>
            支援 JPEG、PNG、WebP、AVIF、GIF、SVG；iPhone 的 HEIC 會自動轉檔，ProRAW（DNG）會使用檔案裡的預覽圖。照片最長邊會縮到 3000 像素。
            單檔最大 1 GB，大檔案會分段上傳。重複上傳同一張照片時，會標示「已上傳過」並自動跳過。
          </p>
        </Tip>

        <Sub>7.2 瀏覽與篩選</Sub>
        <p>
          上方可以用 <B>全部</B> <B>相片</B> <B>影片</B> 切換類型，用「用途」篩選 <B>相片牆</B>、<B>不公開</B>、<B>文章附件</B>
          ，用「排序」改成最新／最早上傳、檔案大小或檔名。
        </p>
        <Shot alt="媒體庫" caption="媒體庫與儲存空間" src="/help/media-library.webp" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-secondary">
                <th className="border border-border px-3 py-2 text-left">用途</th>
                <th className="border border-border px-3 py-2 text-left">從哪裡來</th>
                <th className="border border-border px-3 py-2 text-left">誰看得到</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-border px-3 py-2">相片牆</td>
                <td className="border border-border px-3 py-2">上傳頁勾選「顯示在相片牆」</td>
                <td className="border border-border px-3 py-2">所有人：相冊的相片牆；有標比賽的也會出現在那場比賽的頁面</td>
              </tr>
              <tr>
                <td className="border border-border px-3 py-2">不公開</td>
                <td className="border border-border px-3 py-2">取消勾選「顯示在相片牆」、頭像</td>
                <td className="border border-border px-3 py-2">只有你（頭像會顯示在你的個人頁）</td>
              </tr>
              <tr>
                <td className="border border-border px-3 py-2">文章附件</td>
                <td className="border border-border px-3 py-2">在編輯器裡插入的圖片、封面</td>
                <td className="border border-border px-3 py-2">只在文章裡出現，不上相片牆</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Sub>7.3 修改照片資訊</Sub>
        <p>點任一張照片會打開詳細資料：</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <B>顯示名稱</B>：分享頁的標題，留空就用檔名。
          </li>
          <li>
            <B>描述</B>：這張照片在講什麼，會顯示在燈箱和分享頁（最多 500 字）。
          </li>
          <li>
            <B>替代文字</B>：給螢幕閱讀器描述畫面內容用。
          </li>
          <li>
            <B>顯示在相片牆</B>：隨時可以公開或收回。
          </li>
          <li>「這張照片是哪一場比賽的」：補標或更改比賽。</li>
        </ul>
        <p>
          改完按 <B>儲存</B>。
        </p>
        <Shot alt="照片詳細資料" caption="照片詳細資料" src="/help/media-detail.webp" />
        <HelpClip
          duration="0:22"
          poster="/help/media-detail-poster.webp"
          start={3.25}
          src="/help/media-detail.webm"
          title="替照片取名、寫描述"
        />
        <Tip>
          <p>
            影片上傳後會轉成 1080p，轉檔中會標示「等待轉檔」或「轉檔中」。想換影片在相片牆上的封面，先把影片播放或拖到想要的畫面，再按 <B>用目前畫面當封面</B>
            。轉檔失敗時可以按 <B>重新轉檔</B>，原始檔案會保留。
          </p>
        </Tip>
        <Tip warn>
          <p>
            按 <B>刪除</B> → <B>確定刪除？</B> 會永久刪除檔案。<strong>系統不會檢查有沒有文章正在使用這張照片</strong>
            ，刪除前請先確認，否則文章裡的圖片會消失。
          </p>
        </Tip>
      </Section>

      {/* ───────────────────────────── 8 */}
      <Section icon={CircleHelp} id="faq" title="8. 常見問題">
        <dl className="space-y-4">
          <div>
            <dt className="font-semibold">我改了已發布的文章，網站上怎麼沒變？</dt>
            <dd className="mt-1 text-muted-foreground">
              自動儲存和「儲存草稿」只會更新草稿。看到「有未發布的變更」時，按 <B>更新已發布內容</B> 才會公開新版本。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">為什麼我的照片沒有出現在相片牆？</dt>
            <dd className="mt-1 text-muted-foreground">
              只有用途是「相片牆」的照片會公開。文章裡插入的圖片和頭像不會上相片牆；打開照片詳細資料，勾選 <B>顯示在相片牆</B> 再儲存即可。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">比賽的相片集要自己建立嗎？</dt>
            <dd className="mt-1 text-muted-foreground">
              不用。上傳時（或事後在照片詳細資料裡）標記是哪一場比賽，那場比賽的相片牆就會自動出現這些照片。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">賽事日程上找不到「紀錄比賽」按鈕？</dt>
            <dd className="mt-1 text-muted-foreground">
              這個按鈕只在登入後、而且比賽已經結束時才會出現。也可以直接在會員中心「文章」裡新增一篇，再用 <B>連結比賽</B>。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">可以改文章的網址嗎？</dt>
            <dd className="mt-1 text-muted-foreground">
              可以改「網址代稱」，但已經分享出去的舊連結會失效，建議發布前就決定好。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">儲存空間不夠了怎麼辦？</dt>
            <dd className="mt-1 text-muted-foreground">
              到媒體庫用「排序：檔案大」找出大檔案刪除，或請管理員調高你的額度。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">沒被任何文章使用的圖片會被清掉嗎？</dt>
            <dd className="mt-1 text-muted-foreground">
              只有「文章附件」會：上傳超過一年、而且目前沒有任何文章在用的附件圖片（例如從文章裡刪掉的圖、換掉的封面），系統每週檢查時會先標記並寄信通知你，28
              天後才刪除。你自己上傳到媒體庫的照片（相片牆或不公開）永遠不會被自動清掉。
            </dd>
          </div>
          <div>
            <dt className="font-semibold">還有其他問題？</dt>
            <dd className="mt-1 text-muted-foreground">請聯絡野馬營的管理員。</dd>
          </div>
        </dl>
        <p className="pt-4 text-sm text-muted-foreground">
          <Link className="text-primary underline underline-offset-4" href="/members">
            ← 回到總覽
          </Link>
        </p>
      </Section>
    </article>
  );
}
