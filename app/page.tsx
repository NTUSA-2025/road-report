import type { Metadata } from "next";
import { RoadReportApp } from "./RoadReportApp";

export const metadata: Metadata = {
  title: "臺大道路狀況回報",
  description: "用地圖、照片與驗證碼快速送出臺大公共設施道路報修。",
};

export default function Home() {
  return <RoadReportApp />;
}
