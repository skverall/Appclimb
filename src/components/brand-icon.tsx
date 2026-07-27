import React from "react";
import {
  Compass,
  Globe2,
  Link as LinkIcon,
  Megaphone,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

interface BrandIconProps {
  name: string;
  size?: number;
  className?: string;
  fallbackToDefault?: boolean;
}

export function BrandIcon({
  name,
  size = 16,
  className = "",
  fallbackToDefault = true,
}: BrandIconProps) {
  const norm = (name || "").toLowerCase().trim();
  const style: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
    flexShrink: 0,
  };

  // 1. Google
  if (
    norm.includes("google") ||
    norm.includes("googlebot") ||
    norm === "google"
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style}
        className={`brand-icon brand-icon-google ${className}`}
        aria-hidden="true"
      >
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.35 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.27A7.21 7.21 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.58H1.29A11.98 11.98 0 0 0 0 12c0 1.92.46 3.74 1.29 5.42l3.99-3.15z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
        />
      </svg>
    );
  }

  // 2. ChatGPT / OpenAI (Official OpenAI 6-petal vortex emblem)
  if (
    norm.includes("chatgpt") ||
    norm.includes("openai") ||
    norm.includes("gptbot") ||
    norm === "gpt"
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ ...style, color: "#10a37f" }}
        className={`brand-icon brand-icon-openai ${className}`}
        aria-hidden="true"
      >
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.23a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.798.798 0 0 0 .394-.684v-6.74l2.02 1.166a.072.072 0 0 1 .038.052v5.583a4.508 4.508 0 0 1-4.496 4.498zm-9.014-3.447a4.48 4.48 0 0 1-.536-3.003l.142.085 4.78 2.758a.794.794 0 0 0 .79 0l5.836-3.37v2.332a.08.08 0 0 1-.033.067L9.4 20.47a4.507 4.507 0 0 1-5.154-1.687zM2.784 8.544a4.47 4.47 0 0 1 2.34-1.961v5.68a.79.79 0 0 0 .393.684l5.836 3.37-2.02 1.166a.08.08 0 0 1-.075.006l-4.836-2.793a4.506 4.506 0 0 1-1.638-6.152zm15.74 3.738l-5.836-3.37 2.02-1.166a.08.08 0 0 1 .075-.006l4.836 2.793a4.506 4.506 0 0 1 .684 6.969 4.486 4.486 0 0 1-2.39 1.144v-5.68a.79.79 0 0 0-.389-.684zm2.183-3.642l-.142-.085-4.78-2.758a.794.794 0 0 0-.79 0l-5.836 3.37V6.835a.08.08 0 0 1 .033-.067l4.825-2.786a4.507 4.507 0 0 1 6.69 4.757zm-10.702 3.448l-2.02-1.166a.072.072 0 0 1-.038-.052V5.281a4.508 4.508 0 0 1 7.372-3.458l-.141.081-4.779 2.758a.798.798 0 0 0-.394.684v6.74z" />
      </svg>
    );
  }

  // 3. Instagram
  if (norm.includes("instagram")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style}
        className={`brand-icon brand-icon-instagram ${className}`}
        aria-hidden="true"
      >
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="130%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
        <rect width="24" height="24" rx="6" fill="url(#ig-grad)" />
        <rect
          x="5"
          y="5"
          width="14"
          height="14"
          rx="4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="16.2" cy="7.8" r="1" fill="#fff" />
      </svg>
    );
  }

  // 4. App Store (Apple App Store modern 3-capsule emblem)
  if (
    norm.includes("app store") ||
    norm.includes("appstore") ||
    norm === "app-store-connect"
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        style={{ ...style, borderRadius: "22%" }}
        className={`brand-icon brand-icon-appstore ${className}`}
        aria-hidden="true"
      >
        <rect width="512" height="512" rx="112" fill="#157EFB" />
        <g fill="#FFFFFF">
          <rect x="232" y="80" width="48" height="352" rx="24" transform="rotate(-30 256 256)" />
          <rect x="232" y="80" width="48" height="352" rx="24" transform="rotate(30 256 256)" />
          <rect x="110" y="300" width="292" height="48" rx="24" />
        </g>
      </svg>
    );
  }

  // 5. Apple / iOS / macOS / Safari
  if (
    norm.includes("apple") ||
    norm.includes("applebot") ||
    norm.includes("ios") ||
    norm.includes("macos") ||
    norm.includes("safari")
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={style}
        className={`brand-icon brand-icon-apple ${className}`}
        aria-hidden="true"
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.68-.84 1.15-2.01.99-3.17-1.01.04-2.22.68-2.92 1.5-.63.73-1.18 1.92-1.03 3.06 1.13.09 2.28-.55 2.96-1.39" />
      </svg>
    );
  }

  // 6. Claude / Anthropic
  if (
    norm.includes("claude") ||
    norm.includes("claudebot") ||
    norm.includes("anthropic")
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#D97757"
        style={style}
        className={`brand-icon brand-icon-claude ${className}`}
        aria-hidden="true"
      >
        <path d="M12 2L14.2 8.6L21 9L15.6 13.2L17.8 20L12 15.6L6.2 20L8.4 13.2L3 9L9.8 8.6L12 2Z" />
      </svg>
    );
  }

  // 7. Perplexity
  if (norm.includes("perplexity")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#22B8CF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
        className={`brand-icon brand-icon-perplexity ${className}`}
        aria-hidden="true"
      >
        <path d="M12 2v20M5 7l14 10M5 17L19 7" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  // 8. Bing / Microsoft / Edge / Windows
  if (
    norm.includes("bing") ||
    norm.includes("microsoft") ||
    norm.includes("edge") ||
    norm.includes("windows")
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style}
        className={`brand-icon brand-icon-microsoft ${className}`}
        aria-hidden="true"
      >
        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
        <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
        <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
        <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
      </svg>
    );
  }

  // 9. DuckDuckGo
  if (norm.includes("duckduckgo")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#DE5833"
        style={style}
        className={`brand-icon brand-icon-duckduckgo ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12c1-2 4-3 6-1s1 4-1 5H9c-1 0-1-4-1-4z" fill="#FFF" />
        <circle cx="15" cy="10" r="1" fill="#000" />
      </svg>
    );
  }

  // 10. Brave
  if (norm.includes("brave")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF1B2D"
        style={style}
        className={`brand-icon brand-icon-brave ${className}`}
        aria-hidden="true"
      >
        <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6l-8-4zm0 4a3 3 0 110 6 3 3 0 010-6z" />
      </svg>
    );
  }

  // 11. Yahoo
  if (norm.includes("yahoo")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#6001D2"
        style={style}
        className={`brand-icon brand-icon-yahoo ${className}`}
        aria-hidden="true"
      >
        <rect width="24" height="24" rx="5" />
        <path d="M6 6l5 7v5h2v-5l5-7h-2.5L12 11.5 8.5 6H6z" fill="#FFF" />
      </svg>
    );
  }

  // 12. Yandex
  if (norm.includes("yandex")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style}
        className={`brand-icon brand-icon-yandex ${className}`}
        aria-hidden="true"
      >
        <rect width="24" height="24" rx="12" fill="#FC3F1D" />
        <path d="M14.2 5h2.2l-3.9 6.8V19h-2.3v-7.2L6.3 5h2.4l2.7 5.1L14.2 5z" fill="#FFF" />
      </svg>
    );
  }

  // 13. Facebook / Meta
  if (norm.includes("facebook") || norm.includes("meta")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#1877F2"
        style={style}
        className={`brand-icon brand-icon-facebook ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path
          d="M15 9h-2a1 1 0 00-1 1v2h3l-.5 3h-2.5v7h-3v-7h-2v-3h2v-2a3.5 3.5 0 013.5-3.5h2.5v2.5z"
          fill="#FFF"
        />
      </svg>
    );
  }

  // 14. Twitter / X
  if (
    norm.includes("twitter") ||
    norm === "x" ||
    norm.includes("t.co") ||
    norm.includes("x.com")
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={style}
        className={`brand-icon brand-icon-x ${className}`}
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  // 15. LinkedIn
  if (norm.includes("linkedin")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#0A66C2"
        style={style}
        className={`brand-icon brand-icon-linkedin ${className}`}
        aria-hidden="true"
      >
        <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14m-.5 15.5v-5.3a3.26 3.26 0 00-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 011.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.78a1.62 1.62 0 100 3.24 1.62 1.62 0 000-3.24z" />
      </svg>
    );
  }

  // 16. TikTok
  if (norm.includes("tiktok")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={style}
        className={`brand-icon brand-icon-tiktok ${className}`}
        aria-hidden="true"
      >
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64c.29 0 .58.04.86.12V9.32a6.34 6.34 0 00-1-.07A6.33 6.33 0 003 15.58a6.33 6.33 0 0010.86 4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-3.04-1.44z" />
      </svg>
    );
  }

  // 17. YouTube
  if (norm.includes("youtube")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF0000"
        style={style}
        className={`brand-icon brand-icon-youtube ${className}`}
        aria-hidden="true"
      >
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }

  // 18. Reddit
  if (norm.includes("reddit")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF4500"
        style={style}
        className={`brand-icon brand-icon-reddit ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7c-2.5 0-4.5 1.5-4.5 3.5 0 .8.4 1.5 1 2-.1.3-.2.7-.2 1 0 2.2 2.2 4 5 4s5-1.8 5-4c0-.3-.1-.7-.2-1 .6-.5 1-1.2 1-2C16.5 8.5 14.5 7 12 7zm-2 3a1 1 0 110 2 1 1 0 010-2zm4 4c-.8.8-2.2.8-3 0a.5.5 0 11.7-.7c.4.4 1.2.4 1.6 0a.5.5 0 11.7.7zm0-2a1 1 0 110-2 1 1 0 010 2z" fill="#FFF" />
      </svg>
    );
  }

  // 19. GitHub
  if (norm.includes("github")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={style}
        className={`brand-icon brand-icon-github ${className}`}
        aria-hidden="true"
      >
        <path d="M12 2A10 10 0 002 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
      </svg>
    );
  }

  // 20. Product Hunt
  if (norm.includes("product hunt") || norm.includes("producthunt")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#DA552F"
        style={style}
        className={`brand-icon brand-icon-producthunt ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M10 7h3a2.5 2.5 0 010 5h-3V7zm0 7v3H8V7h5a4.5 4.5 0 010 9h-3z" fill="#FFF" />
      </svg>
    );
  }

  // 21. Hacker News / Y Combinator
  if (
    norm.includes("hacker news") ||
    norm.includes("ycombinator") ||
    norm.includes("news.ycombinator.com")
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF6600"
        style={style}
        className={`brand-icon brand-icon-ycombinator ${className}`}
        aria-hidden="true"
      >
        <rect width="24" height="24" fill="#FF6600" />
        <path d="M7 6l4.5 8v4h2v-4L18 6h-2.5L12.5 12 9.5 6H7z" fill="#FFF" />
      </svg>
    );
  }

  // 22. ByteDance / Bytespider
  if (norm.includes("bytedance") || norm.includes("bytespider")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#00C4B3"
        style={style}
        className={`brand-icon brand-icon-bytedance ${className}`}
        aria-hidden="true"
      >
        <rect width="24" height="24" rx="5" />
        <path d="M6 7l4 2v8l-4-2V7zm8-2l4 2v10l-4-2V5z" fill="#FFF" />
      </svg>
    );
  }

  // 23. Amazon
  if (norm.includes("amazon") || norm.includes("amazonbot")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF9900"
        style={style}
        className={`brand-icon brand-icon-amazon ${className}`}
        aria-hidden="true"
      >
        <rect width="24" height="24" rx="4" fill="#232F3E" />
        <path d="M6 16c4 2 8 2 12-1m-1.5-.5l1.5 1.5L19 14" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
    );
  }

  // 24. DeepSeek
  if (norm.includes("deepseek")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#4D6BFE"
        style={style}
        className={`brand-icon brand-icon-deepseek ${className}`}
        aria-hidden="true"
      >
        <path d="M12 3C7 3 3 7 3 12c0 3.5 2 6.5 5 8 .5-2 2-3.5 4-3.5s3.5 1.5 4 3.5c3-1.5 5-4.5 5-8 0-5-4-9-9-9z" />
        <circle cx="9" cy="10" r="1.5" fill="#FFF" />
      </svg>
    );
  }

  // 25. Chrome
  if (norm.includes("chrome")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style}
        className={`brand-icon brand-icon-chrome ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" fill="#4285F4" />
        <path d="M12 12l8.66-5A10 10 0 003.34 7L12 12z" fill="#EA4335" />
        <path d="M12 12L3.34 7a10 10 0 005.32 14.66L12 12z" fill="#FBBC05" />
        <path d="M12 12l-3.34 9.66A10 10 0 0020.66 7L12 12z" fill="#34A853" />
        <circle cx="12" cy="12" r="4" fill="#FFF" />
        <circle cx="12" cy="12" r="3" fill="#1A73E8" />
      </svg>
    );
  }

  // 26. Firefox
  if (norm.includes("firefox")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FF7139"
        style={style}
        className={`brand-icon brand-icon-firefox ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 4c4 0 7 3 7 7 0 3.5-2.5 6.5-6 7 1-1 1-3 0-4-1-1-3-1-4 0 0-2 1-4 3-5-2 0-3 2-3 3 0-4 3-8 7-8z" fill="#FFC83B" />
      </svg>
    );
  }

  // 27. Linux
  if (norm.includes("linux")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#FCC624"
        style={style}
        className={`brand-icon brand-icon-linux ${className}`}
        aria-hidden="true"
      >
        <ellipse cx="12" cy="14" rx="6" ry="8" fill="#000" />
        <ellipse cx="12" cy="15" rx="4" ry="6" fill="#FFF" />
        <circle cx="10" cy="10" r="1" fill="#000" />
        <circle cx="14" cy="10" r="1" fill="#000" />
        <path d="M11 12h2l-1 2z" fill="#FFA500" />
      </svg>
    );
  }

  // 28. Android
  if (norm.includes("android")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#3DDC84"
        style={style}
        className={`brand-icon brand-icon-android ${className}`}
        aria-hidden="true"
      >
        <path d="M6 14a6 6 0 0112 0H6z" />
        <circle cx="9" cy="11" r="0.8" fill="#FFF" />
        <circle cx="15" cy="11" r="0.8" fill="#FFF" />
        <path d="M7 6l-1.5-2M17 6l1.5-2" stroke="#3DDC84" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 29. Channel Types (Organic Search, AI Referral, Social, Direct, Campaigns, Referral)
  if (
    norm === "organic search" ||
    norm.includes("organic search") ||
    norm === "search"
  ) {
    return (
      <Search
        size={size}
        style={style}
        className={`brand-icon brand-icon-search ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (
    norm === "ai referral" ||
    norm === "ai" ||
    norm.startsWith("ai ") ||
    norm.endsWith(" ai") ||
    norm.includes("ai referral") ||
    norm.includes("ai-referral")
  ) {
    return (
      <Sparkles
        size={size}
        style={style}
        className={`brand-icon brand-icon-ai ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (norm.includes("social")) {
    return (
      <Users
        size={size}
        style={style}
        className={`brand-icon brand-icon-social ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (norm.includes("direct")) {
    return (
      <Compass
        size={size}
        style={style}
        className={`brand-icon brand-icon-direct ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (norm.includes("campaign")) {
    return (
      <Megaphone
        size={size}
        style={style}
        className={`brand-icon brand-icon-campaign ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (
    norm.includes("referral") ||
    norm.includes("http") ||
    norm.includes(".")
  ) {
    return (
      <LinkIcon
        size={size}
        style={style}
        className={`brand-icon brand-icon-referral ${className}`}
        aria-hidden="true"
      />
    );
  }

  if (!fallbackToDefault) return null;

  return (
    <Globe2
      size={size}
      style={style}
      className={`brand-icon brand-icon-default ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Returns the best brand icon given both channel and detail/source strings.
 */
export function SourceBrandIcon({
  channel,
  detail,
  size = 16,
  className = "",
}: {
  channel?: string;
  detail?: string;
  size?: number;
  className?: string;
}) {
  const detailStr = (detail || "").trim();
  const channelStr = (channel || "").trim();

  // Try detail/source first as it contains specific brand like Google, ChatGPT, Instagram, Apple
  if (detailStr && detailStr !== "Direct / none" && detailStr !== "none") {
    const detailIcon = (
      <BrandIcon
        name={detailStr}
        size={size}
        className={className}
        fallbackToDefault={false}
      />
    );
    if (detailIcon) return detailIcon;
  }

  // Fallback to channel
  if (channelStr) {
    return (
      <BrandIcon
        name={channelStr}
        size={size}
        className={className}
        fallbackToDefault={true}
      />
    );
  }

  return (
    <BrandIcon
      name="referral"
      size={size}
      className={className}
      fallbackToDefault={true}
    />
  );
}
