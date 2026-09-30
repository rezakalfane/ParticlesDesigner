// Generates the desktop app icon (electron/icon.png + electron/icon.icns):
// a luminous particle spiral on a dark macOS squircle. Rendered by Electron itself
// (offscreen window → capturePage), sized with sips, packaged with iconutil.
//   npx electron scripts/generate-icon.mjs      (npm run icon)
import { app, BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZE = 1024;
// Apple's grid: an 824px rounded square centred on the 1024 canvas.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.5" r="0.7">
      <stop offset="0" stop-color="#14213d"/><stop offset="1" stop-color="#03050c"/>
    </radialGradient>
    <radialGradient id="core" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff7d6" stop-opacity="0.95"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/>
  <rect x="100.5" y="100.5" width="823" height="823" rx="186" fill="none" stroke="#1e3a5f" stroke-width="3"/>
  <circle cx="512" cy="512" r="120" fill="url(#core)"/>
  <g>
    <circle cx="547" cy="502" r="2.0" fill="#7dd3fc" opacity="0.54"/>
    <circle cx="554" cy="511" r="2.0" fill="#38bdf8" opacity="0.75"/>
    <circle cx="541" cy="515" r="2.0" fill="#fbbf24" opacity="0.55"/>
    <circle cx="552" cy="529" r="2.0" fill="#fde68a" opacity="0.61"/>
    <circle cx="558" cy="535" r="2.1" fill="#7dd3fc" opacity="0.70"/>
    <circle cx="568" cy="513" r="2.1" fill="#38bdf8" opacity="0.64"/>
    <circle cx="544" cy="518" r="2.0" fill="#fbbf24" opacity="0.91"/>
    <circle cx="544" cy="534" r="2.1" fill="#fde68a" opacity="0.69"/>
    <circle cx="554" cy="522" r="2.0" fill="#7dd3fc" opacity="0.60"/>
    <circle cx="556" cy="535" r="2.1" fill="#38bdf8" opacity="0.79"/>
    <circle cx="548" cy="535" r="2.2" fill="#fbbf24" opacity="0.85"/>
    <circle cx="541" cy="545" r="2.2" fill="#fde68a" opacity="0.94"/>
    <circle cx="552" cy="540" r="2.3" fill="#7dd3fc" opacity="0.56"/>
    <circle cx="541" cy="556" r="2.1" fill="#38bdf8" opacity="0.74"/>
    <circle cx="528" cy="556" r="2.3" fill="#fbbf24" opacity="0.79"/>
    <circle cx="548" cy="549" r="2.3" fill="#fde68a" opacity="0.80"/>
    <circle cx="537" cy="555" r="2.4" fill="#7dd3fc" opacity="0.97"/>
    <circle cx="530" cy="563" r="2.0" fill="#38bdf8" opacity="0.85"/>
    <circle cx="532" cy="574" r="2.4" fill="#fbbf24" opacity="0.64"/>
    <circle cx="520" cy="567" r="2.0" fill="#fde68a" opacity="0.73"/>
    <circle cx="510" cy="553" r="2.0" fill="#7dd3fc" opacity="0.88"/>
    <circle cx="505" cy="557" r="2.2" fill="#38bdf8" opacity="0.94"/>
    <circle cx="499" cy="564" r="2.3" fill="#fbbf24" opacity="0.94"/>
    <circle cx="515" cy="576" r="2.2" fill="#fde68a" opacity="0.71"/>
    <circle cx="497" cy="577" r="2.6" fill="#7dd3fc" opacity="0.58"/>
    <circle cx="487" cy="559" r="2.2" fill="#38bdf8" opacity="0.74"/>
    <circle cx="494" cy="560" r="2.0" fill="#fbbf24" opacity="0.71"/>
    <circle cx="483" cy="567" r="2.7" fill="#fde68a" opacity="0.85"/>
    <circle cx="482" cy="568" r="2.5" fill="#7dd3fc" opacity="0.53"/>
    <circle cx="488" cy="571" r="2.7" fill="#38bdf8" opacity="0.90"/>
    <circle cx="469" cy="559" r="2.1" fill="#fbbf24" opacity="0.82"/>
    <circle cx="455" cy="548" r="2.2" fill="#fde68a" opacity="0.58"/>
    <circle cx="458" cy="545" r="2.0" fill="#7dd3fc" opacity="0.58"/>
    <circle cx="446" cy="551" r="2.0" fill="#38bdf8" opacity="0.94"/>
    <circle cx="456" cy="542" r="2.2" fill="#fbbf24" opacity="0.67"/>
    <circle cx="445" cy="538" r="2.8" fill="#fde68a" opacity="1.00"/>
    <circle cx="444" cy="545" r="2.1" fill="#7dd3fc" opacity="0.55"/>
    <circle cx="437" cy="535" r="2.8" fill="#38bdf8" opacity="0.58"/>
    <circle cx="425" cy="550" r="2.5" fill="#fbbf24" opacity="0.57"/>
    <circle cx="437" cy="520" r="2.6" fill="#fde68a" opacity="0.99"/>
    <circle cx="443" cy="534" r="2.3" fill="#7dd3fc" opacity="0.68"/>
    <circle cx="421" cy="531" r="2.6" fill="#38bdf8" opacity="0.89"/>
    <circle cx="424" cy="511" r="2.9" fill="#fbbf24" opacity="0.99"/>
    <circle cx="437" cy="522" r="2.9" fill="#fde68a" opacity="0.87"/>
    <circle cx="419" cy="509" r="2.4" fill="#7dd3fc" opacity="0.51"/>
    <circle cx="413" cy="497" r="2.3" fill="#38bdf8" opacity="0.85"/>
    <circle cx="439" cy="496" r="3.2" fill="#fbbf24" opacity="0.99"/>
    <circle cx="439" cy="488" r="2.3" fill="#fde68a" opacity="0.61"/>
    <circle cx="419" cy="478" r="2.8" fill="#7dd3fc" opacity="0.95"/>
    <circle cx="438" cy="481" r="2.9" fill="#38bdf8" opacity="0.90"/>
    <circle cx="419" cy="480" r="3.2" fill="#fbbf24" opacity="0.89"/>
    <circle cx="440" cy="470" r="2.2" fill="#fde68a" opacity="0.89"/>
    <circle cx="431" cy="473" r="3.4" fill="#7dd3fc" opacity="0.70"/>
    <circle cx="437" cy="472" r="3.0" fill="#38bdf8" opacity="0.59"/>
    <circle cx="433" cy="445" r="3.3" fill="#fbbf24" opacity="0.90"/>
    <circle cx="438" cy="459" r="3.5" fill="#fde68a" opacity="0.83"/>
    <circle cx="448" cy="447" r="2.2" fill="#7dd3fc" opacity="0.51"/>
    <circle cx="471" cy="446" r="2.8" fill="#38bdf8" opacity="0.97"/>
    <circle cx="461" cy="448" r="3.3" fill="#fbbf24" opacity="0.61"/>
    <circle cx="462" cy="428" r="2.4" fill="#fde68a" opacity="0.79"/>
    <circle cx="469" cy="428" r="2.2" fill="#7dd3fc" opacity="0.96"/>
    <circle cx="478" cy="427" r="3.0" fill="#38bdf8" opacity="0.95"/>
    <circle cx="487" cy="437" r="2.8" fill="#fbbf24" opacity="0.77"/>
    <circle cx="497" cy="410" r="2.7" fill="#fde68a" opacity="0.59"/>
    <circle cx="490" cy="430" r="2.3" fill="#7dd3fc" opacity="0.74"/>
    <circle cx="518" cy="422" r="2.6" fill="#38bdf8" opacity="0.76"/>
    <circle cx="521" cy="428" r="2.2" fill="#fbbf24" opacity="0.78"/>
    <circle cx="521" cy="414" r="3.4" fill="#fde68a" opacity="0.75"/>
    <circle cx="538" cy="427" r="3.7" fill="#7dd3fc" opacity="0.72"/>
    <circle cx="547" cy="421" r="3.0" fill="#38bdf8" opacity="0.85"/>
    <circle cx="551" cy="423" r="2.9" fill="#fbbf24" opacity="0.97"/>
    <circle cx="566" cy="435" r="3.8" fill="#fde68a" opacity="0.63"/>
    <circle cx="569" cy="439" r="3.6" fill="#7dd3fc" opacity="0.57"/>
    <circle cx="565" cy="428" r="2.1" fill="#38bdf8" opacity="0.62"/>
    <circle cx="571" cy="438" r="3.6" fill="#fbbf24" opacity="0.95"/>
    <circle cx="580" cy="443" r="3.3" fill="#fde68a" opacity="0.57"/>
    <circle cx="608" cy="454" r="2.4" fill="#7dd3fc" opacity="0.98"/>
    <circle cx="601" cy="446" r="4.1" fill="#38bdf8" opacity="0.92"/>
    <circle cx="600" cy="450" r="3.1" fill="#fbbf24" opacity="0.67"/>
    <circle cx="607" cy="452" r="3.5" fill="#fde68a" opacity="0.51"/>
    <circle cx="622" cy="462" r="2.0" fill="#7dd3fc" opacity="0.67"/>
    <circle cx="629" cy="470" r="2.1" fill="#38bdf8" opacity="0.99"/>
    <circle cx="638" cy="490" r="2.2" fill="#fbbf24" opacity="0.63"/>
    <circle cx="621" cy="492" r="2.6" fill="#fde68a" opacity="0.56"/>
    <circle cx="635" cy="503" r="3.9" fill="#7dd3fc" opacity="0.63"/>
    <circle cx="630" cy="511" r="3.3" fill="#38bdf8" opacity="0.85"/>
    <circle cx="630" cy="494" r="3.6" fill="#fbbf24" opacity="0.71"/>
    <circle cx="630" cy="527" r="3.5" fill="#fde68a" opacity="0.90"/>
    <circle cx="631" cy="533" r="2.2" fill="#7dd3fc" opacity="0.93"/>
    <circle cx="641" cy="526" r="3.3" fill="#38bdf8" opacity="0.96"/>
    <circle cx="635" cy="529" r="3.3" fill="#fbbf24" opacity="0.62"/>
    <circle cx="629" cy="538" r="2.1" fill="#fde68a" opacity="0.60"/>
    <circle cx="632" cy="550" r="3.9" fill="#7dd3fc" opacity="0.64"/>
    <circle cx="634" cy="554" r="2.9" fill="#38bdf8" opacity="0.51"/>
    <circle cx="624" cy="558" r="3.9" fill="#fbbf24" opacity="0.78"/>
    <circle cx="617" cy="578" r="4.4" fill="#fde68a" opacity="0.55"/>
    <circle cx="630" cy="584" r="3.3" fill="#7dd3fc" opacity="0.92"/>
    <circle cx="612" cy="594" r="3.8" fill="#38bdf8" opacity="0.99"/>
    <circle cx="604" cy="610" r="3.9" fill="#fbbf24" opacity="0.82"/>
    <circle cx="599" cy="602" r="2.1" fill="#fde68a" opacity="0.56"/>
    <circle cx="582" cy="619" r="2.7" fill="#7dd3fc" opacity="0.58"/>
    <circle cx="574" cy="628" r="4.4" fill="#38bdf8" opacity="0.84"/>
    <circle cx="571" cy="616" r="2.8" fill="#fbbf24" opacity="0.73"/>
    <circle cx="558" cy="626" r="2.7" fill="#fde68a" opacity="0.98"/>
    <circle cx="571" cy="633" r="2.7" fill="#7dd3fc" opacity="0.98"/>
    <circle cx="542" cy="631" r="2.0" fill="#38bdf8" opacity="0.69"/>
    <circle cx="537" cy="638" r="2.6" fill="#fbbf24" opacity="0.75"/>
    <circle cx="513" cy="633" r="2.3" fill="#fde68a" opacity="0.70"/>
    <circle cx="503" cy="628" r="2.9" fill="#7dd3fc" opacity="0.62"/>
    <circle cx="507" cy="643" r="4.2" fill="#38bdf8" opacity="0.83"/>
    <circle cx="499" cy="653" r="3.2" fill="#fbbf24" opacity="0.66"/>
    <circle cx="496" cy="632" r="4.2" fill="#fde68a" opacity="0.82"/>
    <circle cx="458" cy="650" r="4.7" fill="#7dd3fc" opacity="0.81"/>
    <circle cx="466" cy="647" r="2.4" fill="#38bdf8" opacity="0.76"/>
    <circle cx="449" cy="645" r="4.5" fill="#fbbf24" opacity="0.91"/>
    <circle cx="440" cy="643" r="4.1" fill="#fde68a" opacity="0.85"/>
    <circle cx="420" cy="615" r="2.4" fill="#7dd3fc" opacity="0.68"/>
    <circle cx="406" cy="632" r="3.8" fill="#38bdf8" opacity="0.81"/>
    <circle cx="411" cy="623" r="3.6" fill="#fbbf24" opacity="0.50"/>
    <circle cx="406" cy="618" r="3.6" fill="#fde68a" opacity="0.77"/>
    <circle cx="393" cy="593" r="4.4" fill="#7dd3fc" opacity="0.63"/>
    <circle cx="368" cy="591" r="4.4" fill="#38bdf8" opacity="0.60"/>
    <circle cx="379" cy="603" r="3.6" fill="#fbbf24" opacity="0.69"/>
    <circle cx="365" cy="586" r="4.5" fill="#fde68a" opacity="0.81"/>
    <circle cx="363" cy="561" r="2.5" fill="#7dd3fc" opacity="0.63"/>
    <circle cx="360" cy="558" r="3.9" fill="#38bdf8" opacity="0.51"/>
    <circle cx="336" cy="547" r="4.3" fill="#fbbf24" opacity="0.85"/>
    <circle cx="349" cy="538" r="3.8" fill="#fde68a" opacity="0.73"/>
    <circle cx="340" cy="523" r="5.1" fill="#7dd3fc" opacity="0.60"/>
    <circle cx="352" cy="535" r="2.1" fill="#38bdf8" opacity="0.73"/>
    <circle cx="346" cy="525" r="3.6" fill="#fbbf24" opacity="0.63"/>
    <circle cx="328" cy="514" r="2.7" fill="#fde68a" opacity="0.79"/>
    <circle cx="327" cy="491" r="5.4" fill="#7dd3fc" opacity="0.57"/>
    <circle cx="347" cy="480" r="5.2" fill="#38bdf8" opacity="0.85"/>
    <circle cx="333" cy="480" r="3.8" fill="#fbbf24" opacity="0.51"/>
    <circle cx="330" cy="457" r="3.6" fill="#fde68a" opacity="0.65"/>
    <circle cx="338" cy="443" r="3.2" fill="#7dd3fc" opacity="0.92"/>
    <circle cx="339" cy="444" r="5.1" fill="#38bdf8" opacity="0.56"/>
    <circle cx="371" cy="433" r="5.3" fill="#fbbf24" opacity="0.64"/>
    <circle cx="362" cy="414" r="5.7" fill="#fde68a" opacity="0.79"/>
    <circle cx="369" cy="405" r="3.0" fill="#7dd3fc" opacity="0.52"/>
    <circle cx="371" cy="408" r="3.1" fill="#38bdf8" opacity="0.97"/>
    <circle cx="384" cy="384" r="4.0" fill="#fbbf24" opacity="0.59"/>
    <circle cx="398" cy="395" r="5.4" fill="#fde68a" opacity="0.91"/>
    <circle cx="416" cy="387" r="5.6" fill="#7dd3fc" opacity="0.77"/>
    <circle cx="430" cy="356" r="4.9" fill="#38bdf8" opacity="0.73"/>
    <circle cx="443" cy="367" r="3.1" fill="#fbbf24" opacity="0.52"/>
    <circle cx="460" cy="347" r="3.9" fill="#fde68a" opacity="0.67"/>
    <circle cx="455" cy="360" r="5.9" fill="#7dd3fc" opacity="0.63"/>
    <circle cx="479" cy="344" r="4.2" fill="#38bdf8" opacity="0.70"/>
    <circle cx="479" cy="337" r="2.8" fill="#fbbf24" opacity="0.95"/>
    <circle cx="502" cy="337" r="5.7" fill="#fde68a" opacity="1.00"/>
    <circle cx="515" cy="334" r="2.8" fill="#7dd3fc" opacity="0.55"/>
    <circle cx="527" cy="332" r="3.0" fill="#38bdf8" opacity="0.63"/>
    <circle cx="548" cy="355" r="5.1" fill="#fbbf24" opacity="0.71"/>
    <circle cx="558" cy="347" r="3.6" fill="#fde68a" opacity="0.67"/>
    <circle cx="562" cy="342" r="6.1" fill="#7dd3fc" opacity="0.56"/>
    <circle cx="589" cy="356" r="5.6" fill="#38bdf8" opacity="0.61"/>
    <circle cx="596" cy="349" r="3.7" fill="#fbbf24" opacity="0.72"/>
    <circle cx="629" cy="371" r="5.7" fill="#fde68a" opacity="0.51"/>
    <circle cx="616" cy="374" r="5.9" fill="#7dd3fc" opacity="0.74"/>
    <circle cx="644" cy="361" r="3.7" fill="#38bdf8" opacity="0.96"/>
    <circle cx="663" cy="392" r="6.2" fill="#fbbf24" opacity="0.62"/>
    <circle cx="654" cy="381" r="4.3" fill="#fde68a" opacity="0.84"/>
    <circle cx="688" cy="406" r="4.9" fill="#7dd3fc" opacity="0.88"/>
    <circle cx="685" cy="411" r="2.2" fill="#38bdf8" opacity="0.89"/>
    <circle cx="688" cy="432" r="4.9" fill="#fbbf24" opacity="0.65"/>
    <circle cx="693" cy="425" r="4.9" fill="#fde68a" opacity="0.85"/>
    <circle cx="700" cy="431" r="4.4" fill="#7dd3fc" opacity="0.79"/>
    <circle cx="714" cy="448" r="4.7" fill="#38bdf8" opacity="0.51"/>
    <circle cx="717" cy="467" r="6.4" fill="#fbbf24" opacity="0.82"/>
    <circle cx="737" cy="480" r="3.1" fill="#fde68a" opacity="0.62"/>
    <circle cx="742" cy="500" r="3.4" fill="#7dd3fc" opacity="0.51"/>
    <circle cx="732" cy="512" r="4.0" fill="#38bdf8" opacity="0.63"/>
    <circle cx="737" cy="533" r="3.1" fill="#fbbf24" opacity="0.52"/>
    <circle cx="728" cy="532" r="5.2" fill="#fde68a" opacity="0.60"/>
    <circle cx="739" cy="555" r="4.4" fill="#7dd3fc" opacity="0.60"/>
    <circle cx="741" cy="557" r="5.9" fill="#38bdf8" opacity="0.62"/>
    <circle cx="716" cy="583" r="3.4" fill="#fbbf24" opacity="0.98"/>
    <circle cx="719" cy="580" r="3.1" fill="#fde68a" opacity="0.71"/>
    <circle cx="718" cy="614" r="2.7" fill="#7dd3fc" opacity="0.70"/>
    <circle cx="698" cy="628" r="2.7" fill="#38bdf8" opacity="0.53"/>
    <circle cx="685" cy="623" r="6.4" fill="#fbbf24" opacity="0.94"/>
    <circle cx="694" cy="652" r="6.6" fill="#fde68a" opacity="0.66"/>
    <circle cx="669" cy="661" r="5.7" fill="#7dd3fc" opacity="0.52"/>
    <circle cx="671" cy="656" r="3.9" fill="#38bdf8" opacity="0.67"/>
    <circle cx="644" cy="656" r="3.4" fill="#fbbf24" opacity="0.68"/>
    <circle cx="653" cy="668" r="6.9" fill="#fde68a" opacity="0.60"/>
    <circle cx="622" cy="696" r="6.2" fill="#7dd3fc" opacity="0.72"/>
    <circle cx="599" cy="693" r="3.9" fill="#38bdf8" opacity="0.96"/>
    <circle cx="588" cy="697" r="6.6" fill="#fbbf24" opacity="0.52"/>
    <circle cx="578" cy="715" r="5.9" fill="#fde68a" opacity="0.52"/>
    <circle cx="551" cy="698" r="6.8" fill="#7dd3fc" opacity="0.63"/>
    <circle cx="554" cy="725" r="3.8" fill="#38bdf8" opacity="0.64"/>
    <circle cx="542" cy="720" r="3.4" fill="#fbbf24" opacity="0.86"/>
    <circle cx="507" cy="712" r="2.0" fill="#fde68a" opacity="0.88"/>
    <circle cx="506" cy="722" r="7.0" fill="#7dd3fc" opacity="0.51"/>
    <circle cx="469" cy="717" r="7.1" fill="#38bdf8" opacity="0.98"/>
    <circle cx="456" cy="709" r="4.3" fill="#fbbf24" opacity="0.75"/>
    <circle cx="453" cy="704" r="6.3" fill="#fde68a" opacity="0.87"/>
    <circle cx="433" cy="716" r="5.3" fill="#7dd3fc" opacity="0.66"/>
    <circle cx="402" cy="700" r="6.2" fill="#38bdf8" opacity="0.54"/>
    <circle cx="382" cy="705" r="3.3" fill="#fbbf24" opacity="0.53"/>
    <circle cx="362" cy="692" r="3.8" fill="#fde68a" opacity="0.99"/>
    <circle cx="370" cy="696" r="3.5" fill="#7dd3fc" opacity="0.54"/>
    <circle cx="333" cy="673" r="5.9" fill="#38bdf8" opacity="0.72"/>
    <circle cx="323" cy="660" r="5.4" fill="#fbbf24" opacity="0.84"/>
    <circle cx="324" cy="661" r="5.7" fill="#fde68a" opacity="0.56"/>
    <circle cx="314" cy="634" r="5.2" fill="#7dd3fc" opacity="0.69"/>
    <circle cx="300" cy="619" r="3.4" fill="#38bdf8" opacity="0.62"/>
    <circle cx="274" cy="625" r="5.3" fill="#fbbf24" opacity="0.66"/>
    <circle cx="272" cy="614" r="4.9" fill="#fde68a" opacity="0.62"/>
    <circle cx="275" cy="590" r="7.7" fill="#7dd3fc" opacity="0.55"/>
    <circle cx="259" cy="579" r="6.8" fill="#38bdf8" opacity="0.96"/>
    <circle cx="242" cy="549" r="2.7" fill="#fbbf24" opacity="0.59"/>
    <circle cx="264" cy="541" r="7.4" fill="#fde68a" opacity="0.69"/>
    <circle cx="258" cy="521" r="3.5" fill="#7dd3fc" opacity="0.89"/>
    <circle cx="259" cy="496" r="5.5" fill="#38bdf8" opacity="0.81"/>
    <circle cx="239" cy="486" r="2.8" fill="#fbbf24" opacity="0.60"/>
    <circle cx="242" cy="477" r="5.8" fill="#fde68a" opacity="0.60"/>
    <circle cx="238" cy="453" r="6.0" fill="#7dd3fc" opacity="0.59"/>
    <circle cx="250" cy="433" r="6.7" fill="#38bdf8" opacity="0.77"/>
    <circle cx="249" cy="414" r="4.4" fill="#fbbf24" opacity="0.78"/>
    <circle cx="272" cy="398" r="3.0" fill="#fde68a" opacity="0.85"/>
    <circle cx="274" cy="388" r="3.9" fill="#7dd3fc" opacity="0.98"/>
    <circle cx="282" cy="382" r="4.2" fill="#38bdf8" opacity="0.71"/>
    <circle cx="308" cy="380" r="4.2" fill="#fbbf24" opacity="0.60"/>
    <circle cx="316" cy="344" r="2.0" fill="#fde68a" opacity="0.95"/>
    <circle cx="321" cy="349" r="4.5" fill="#7dd3fc" opacity="0.94"/>
    <circle cx="337" cy="318" r="2.1" fill="#38bdf8" opacity="0.78"/>
    <circle cx="358" cy="328" r="2.6" fill="#fbbf24" opacity="0.81"/>
    <circle cx="366" cy="307" r="2.9" fill="#fde68a" opacity="0.64"/>
    <circle cx="388" cy="310" r="2.7" fill="#7dd3fc" opacity="0.75"/>
    <circle cx="414" cy="303" r="3.2" fill="#38bdf8" opacity="0.56"/>
    <circle cx="437" cy="297" r="5.0" fill="#fbbf24" opacity="0.53"/>
    <circle cx="456" cy="274" r="7.7" fill="#fde68a" opacity="0.81"/>
    <circle cx="473" cy="264" r="7.0" fill="#7dd3fc" opacity="0.61"/>
    <circle cx="482" cy="280" r="7.3" fill="#38bdf8" opacity="0.59"/>
    <circle cx="497" cy="265" r="5.3" fill="#fbbf24" opacity="0.69"/>
    <circle cx="515" cy="260" r="6.7" fill="#fde68a" opacity="0.95"/>
    <circle cx="534" cy="270" r="6.9" fill="#7dd3fc" opacity="0.52"/>
    <circle cx="577" cy="259" r="5.9" fill="#38bdf8" opacity="0.78"/>
    <circle cx="592" cy="268" r="4.7" fill="#fbbf24" opacity="0.79"/>
    <circle cx="607" cy="282" r="4.9" fill="#fde68a" opacity="0.72"/>
    <circle cx="616" cy="287" r="5.2" fill="#7dd3fc" opacity="0.62"/>
    <circle cx="656" cy="298" r="5.0" fill="#38bdf8" opacity="0.59"/>
    <circle cx="667" cy="288" r="2.9" fill="#fbbf24" opacity="0.72"/>
    <circle cx="675" cy="306" r="5.4" fill="#fde68a" opacity="0.52"/>
    <circle cx="708" cy="307" r="6.9" fill="#7dd3fc" opacity="0.89"/>
    <circle cx="721" cy="318" r="5.4" fill="#38bdf8" opacity="0.69"/>
    <circle cx="749" cy="333" r="7.8" fill="#fbbf24" opacity="1.00"/>
    <circle cx="757" cy="366" r="3.3" fill="#fde68a" opacity="0.99"/>
    <circle cx="764" cy="384" r="8.2" fill="#7dd3fc" opacity="0.58"/>
    <circle cx="785" cy="399" r="2.4" fill="#38bdf8" opacity="0.68"/>
    <circle cx="795" cy="394" r="8.1" fill="#fbbf24" opacity="0.64"/>
    <circle cx="806" cy="410" r="5.4" fill="#fde68a" opacity="0.96"/>
    <circle cx="797" cy="431" r="5.5" fill="#7dd3fc" opacity="0.66"/>
    <circle cx="799" cy="447" r="3.1" fill="#38bdf8" opacity="0.97"/>
    <circle cx="822" cy="485" r="3.2" fill="#fbbf24" opacity="0.89"/>
    <circle cx="809" cy="494" r="6.4" fill="#fde68a" opacity="0.68"/>
  </g>
</svg>`;

// No top-level await: an ESM main delays "ready" until the module settles.
app.dock?.hide();
void app.whenReady().then(render);

async function render() {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
  });
  await win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    )}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.capturePage();
  mkdirSync("electron", { recursive: true });
  writeFileSync("electron/icon.png", image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log("wrote electron/icon.png");

  const iconset = "electron/icon.iconset";
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  for (const px of [16, 32, 128, 256, 512]) {
    for (const [suffix, scale] of [
      ["", 1],
      ["@2x", 2],
    ]) {
      execFileSync(
        "sips",
        [
          "-z",
          String(px * scale),
          String(px * scale),
          "electron/icon.png",
          "--out",
          `${iconset}/icon_${px}x${px}${suffix}.png`,
        ],
        { stdio: "ignore" },
      );
    }
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", "electron/icon.icns"]);
  rmSync(iconset, { recursive: true, force: true });
  console.log("wrote electron/icon.icns");
  app.quit();
}
