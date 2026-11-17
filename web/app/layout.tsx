import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'The Daily Signal | AI & Technology',description:'A daily archive of AI, technology and software engineering briefings. Read the sources, watch or listen in English and Mandarin.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
