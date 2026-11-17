import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "LabTrack · 课题组设备管理", description: "课题组设备资产与借还管理" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
