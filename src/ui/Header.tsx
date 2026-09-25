import { useEffect, useRef, useState } from "react";
import { redo, setLang, showToast, undo, useStore } from "../state/store";
import { exportJson, importJson, loadDemo, shareLink } from "../state/persist";
import { useT } from "../i18n";
import { Icon } from "./Icon";

export function Header() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const share = async () => {
    const url = shareLink();
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("toast.linkCopied"));
    } catch {
      // Clipboard can be blocked (e.g. insecure context): fall back to the address bar.
      history.replaceState(null, "", url);
      showToast(t("toast.linkReady"));
    }
  };

  return (
    <header className="header">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="8" fill="var(--accent)" />
          <path d="M8 22V10h10v6h6v6z" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="brand-name">Cabe?</div>
          <div className="brand-tag">{t("app.tagline")}</div>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title={`${t("app.undo")} (⌘Z)`} aria-label={t("app.undo")}>
          <Icon name="undo" size={18} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title={`${t("app.redo")} (⇧⌘Z)`} aria-label={t("app.redo")}>
          <Icon name="redo" size={18} />
        </button>
        <span className="divider" />
        <button className="btn btn-soft btn-sm hide-xs" onClick={share}>
          <Icon name="share" /> <span>{t("app.share")}</span>
        </button>
        <div className="lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "pt" ? "on" : ""} onClick={() => setLang("pt")}>PT</button>
        </div>
        <div className="menu" ref={menuRef}>
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label={t("app.more")} aria-expanded={menu} title={t("app.more")}>
            <Icon name="more" size={18} />
          </button>
          {menu && (
            <div className="menu-pop" role="menu" onClick={() => setMenu(false)}>
              <button role="menuitem" className="show-xs" onClick={share}>
                <Icon name="share" /> {t("app.share")}
              </button>
              <button role="menuitem" onClick={exportJson}>
                <Icon name="download" /> {t("app.export")}
              </button>
              <button role="menuitem" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" /> {t("app.import")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  if (confirm(t("app.demoConfirm"))) {
                    loadDemo();
                    showToast(t("toast.demoLoaded"));
                  }
                }}
              >
                <Icon name="reset" /> {t("app.demo")}
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            showToast((await importJson(f)) ? t("toast.imported") : t("toast.importFailed"));
          }}
        />
      </div>
    </header>
  );
}
