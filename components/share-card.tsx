"use client";

// ShareCard — generates a visual share card (canvas → PNG blob) showing
// the café's station glyph, tier colour, speed, and the contributor's stamp
// on a transit-map fragment. The card is shareable via the Web Share API
// (with file) or downloaded. Matches the newsprint/transit design language.

import { useCallback, useRef } from "react";
import type { Tier } from "@/lib/types";

const TIER_COLOUR: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};
const TIER_LABEL: Record<Tier, string> = {
  express: "EXPRESS LINE",
  local: "LOCAL LINE",
  suspended: "SUSPENDED LINE",
};
const TIER_USE: Record<Tier, string> = {
  express: "video calls OK",
  local: "email & browsing",
  suspended: "avoid for calls",
};

interface ShareCardData {
  cafeName: string;
  neighbourhood: string;
  tier: Tier;
  downMbps: number;
  contributorStats: {
    cafesMapped: number;
    citiesMapped: number;
  };
  /** Deep link to the station, carrying ?via= attribution. Falls back to the
   *  site root when omitted. */
  shareUrl?: string;
}

const CARD_W = 1200;
const CARD_H = 630;

function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData) {
  const { cafeName, neighbourhood, tier, downMbps, contributorStats } = data;
  const colour = TIER_COLOUR[tier];

  // Background — cream paper
  ctx.fillStyle = "#F4ECD8";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Border frame
  ctx.strokeStyle = "#1A1612";
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);

  // Top bar — Lattency wordmark + edition stamp
  ctx.fillStyle = "#1A1612";
  ctx.font = "900 28px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LATTENCY", 64, 80);

  ctx.font = "500 11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#8A7F6B";
  ctx.fillText("VERIFIED WIFI · TRANSIT MAP", 64, 100);

  // Right — contributor stamp
  ctx.textAlign = "right";
  ctx.fillStyle = "#3D362B";
  ctx.font = "500 11px 'IBM Plex Mono', monospace";
  ctx.fillText(`${contributorStats.cafesMapped} STATIONS MAPPED`, CARD_W - 64, 80);
  ctx.fillStyle = "#8A7F6B";
  ctx.fillText(`${contributorStats.citiesMapped} CITIES · CONTRIBUTOR`, CARD_W - 64, 100);

  // Tier badge — large square glyph
  const badgeX = 64;
  const badgeY = 140;
  const badgeSize = 100;
  ctx.fillStyle = colour;
  ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);
  ctx.fillStyle = "#F4ECD8";
  ctx.font = "900 64px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tier[0].toUpperCase(), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 2);
  ctx.textBaseline = "alphabetic";

  // Tier label next to badge
  ctx.textAlign = "left";
  ctx.fillStyle = colour;
  ctx.font = "500 13px 'IBM Plex Mono', monospace";
  ctx.fillText(TIER_LABEL[tier], badgeX + badgeSize + 16, badgeY + 30);
  ctx.fillStyle = "#8A7F6B";
  ctx.font = "italic 16px 'Fraunces', 'Times New Roman', serif";
  ctx.fillText(TIER_USE[tier], badgeX + badgeSize + 16, badgeY + 56);

  // Café name — large display
  ctx.fillStyle = "#1A1612";
  ctx.font = "900 56px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
  ctx.textAlign = "left";
  const name = cafeName.toUpperCase();
  // Wrap if too long
  const maxWidth = CARD_W - 128;
  if (ctx.measureText(name).width > maxWidth) {
    ctx.font = "900 40px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
  }
  ctx.fillText(name, 64, 320);

  // Neighbourhood
  ctx.fillStyle = "#8A7F6B";
  ctx.font = "italic 20px 'Fraunces', 'Times New Roman', serif";
  ctx.fillText(neighbourhood, 64, 355);

  // Speed stat — big number
  ctx.fillStyle = "#1A1612";
  ctx.font = "900 80px 'Big Shoulders Display', 'Arial Narrow', sans-serif";
  ctx.textAlign = "left";
  const speedText = String(Math.round(downMbps));
  ctx.fillText(speedText, 64, 470);
  const speedW = ctx.measureText(speedText).width;
  ctx.font = "500 16px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#8A7F6B";
  ctx.fillText("MBPS DOWN", 64 + speedW + 12, 470);

  // Transit line decoration — three horizontal lines at the bottom
  const lineY = 530;
  const lineStart = 64;
  const lineEnd = CARD_W - 64;
  const tiers: Array<{ colour: string; y: number }> = [
    { colour: "#006D45", y: lineY },
    { colour: "#C77F00", y: lineY + 16 },
    { colour: "#B23A48", y: lineY + 32 },
  ];
  for (const t of tiers) {
    ctx.strokeStyle = t.colour;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lineStart, t.y);
    ctx.lineTo(lineEnd, t.y);
    ctx.stroke();
  }

  // Station dot on the active tier line
  const activeTierIndex = tier === "express" ? 0 : tier === "local" ? 1 : 2;
  ctx.fillStyle = "#F4ECD8";
  ctx.strokeStyle = "#1A1612";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(lineStart + 80, lineY + activeTierIndex * 16, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bottom-right — "mapped by a contributor"
  ctx.textAlign = "right";
  ctx.fillStyle = "#8A7F6B";
  ctx.font = "500 10px 'IBM Plex Mono', monospace";
  ctx.fillText("MAPPED BY A CONTRIBUTOR · LATTENCY.APP", CARD_W - 64, CARD_H - 56);
}

export function useShareCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const generateCard = useCallback(async (data: ShareCardData): Promise<Blob | null> => {
    if (typeof document === "undefined") return null;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShareCard(ctx, data);
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.9);
    });
  }, []);

  const shareCard = useCallback(
    async (data: ShareCardData, shareText: string) => {
      const blob = await generateCard(data);
      if (!blob) return false;

      const fileName = "lattency-station.png";
      const file = new File([blob], fileName, { type: "image/png" });
      const shareUrl =
        data.shareUrl ??
        (typeof window !== "undefined" ? window.location.origin : "https://lattency.app");

      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: "Lattency",
            text: shareText,
            url: shareUrl,
            files: [file],
          });
          return true;
        } catch {
          return false;
        }
      }

      // Fallback: download the image
      if (typeof window !== "undefined") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        // Also copy text
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${shareText} ${shareUrl}`).catch(() => {});
        }
      }
      return true;
    },
    [generateCard],
  );

  return { generateCard, shareCard };
}
