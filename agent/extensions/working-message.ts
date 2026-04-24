import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const messages = [
  "Baking...",
  "Beaming...",
  "Beboppin'...",
  "Befuddling...",
  "Billowing...",
  "Blanching...",
  "Bloviating...",
  "Boogieing...",
  "Boondoggling...",
  "Booping...",
  "Bootstrapping...",
  "Brewing...",
  "Bunning...",
  "Burrowing...",
  "Calculating...",
  "Canoodling...",
  "Caramelizing...",
  "Cascading...",
  "Catapulting...",
  "Cerebrating...",
  "Channeling...",
  "Choreographing...",
  "Churning...",
  "Coalescing...",
  "Cogitating...",
  "Combobulating...",
  "Composing...",
  "Computing...",
  "Concocting...",
  "Considering...",
  "Contemplating...",
  "Cooking...",
  "Crafting...",
  "Creating...",
  "Crunching...",
  "Crystallizing...",
  "Cultivating...",
  "Deciphering...",
  "Deliberating...",
  "Determining...",
  "Dilly-dallying...",
  "Discombobulating...",
  "Doing...",
  "Doodling...",
  "Drizzling...",
  "Ebbing...",
  "Effecting...",
  "Elucidating...",
  "Embellishing...",
  "Enchanting...",
  "Envisioning...",
  "Evaporating...",
  "Fermenting...",
  "Fiddle-faddling...",
  "Finagling...",
  "Flambéing...",
  "Flibbertigibbeting...",
  "Flowing...",
  "Flummoxing...",
  "Fluttering...",
  "Forging...",
  "Forming...",
  "Frolicking...",
  "Frosting...",
  "Gallivanting...",
  "Galloping...",
  "Garnishing...",
  "Generating...",
  "Germinating...",
  "Gesticulating...",
  "Gitifying...",
  "Grooving...",
  "Gusting...",
  "Harmonizing...",
  "Hashing...",
  "Hatching...",
  "Herding...",
  "Honking...",
  "Hullaballooing...",
  "Hyperspacing...",
  "Ideating...",
  "Imagining...",
  "Improvising...",
  "Incubating...",
  "Inferring...",
  "Infusing...",
  "Ionizing...",
  "Jitterbugging...",
  "Julienning...",
  "Kneading...",
  "Leavening...",
  "Levitating...",
  "Lollygagging...",
  "Manifesting...",
  "Marinating...",
  "Meandering...",
  "Metamorphosing...",
  "Misting...",
  "Moonwalking...",
  "Moseying...",
  "Mulling...",
  "Musing...",
  "Mustering...",
  "Nebulizing...",
  "Nesting...",
  "Newspapering...",
  "Noodling...",
  "Nucleating...",
  "Orbiting...",
  "Orchestrating...",
  "Osmosing...",
  "Perambulating...",
  "Percolating...",
  "Perusing...",
  "Philosophising...",
  "Photosynthesizing...",
  "Pollinating...",
  "Pondering...",
  "Pontificating...",
  "Pouncing...",
  "Precipitating...",
  "Prestidigitating...",
  "Processing...",
  "Proofing...",
  "Propagating...",
  "Puttering...",
  "Puzzling...",
  "Quantumizing...",
  "Razzle-dazzling...",
  "Razzmatazzing...",
  "Recombobulating...",
  "Reticulating...",
  "Roosting...",
  "Ruminating...",
  "Sautéing...",
  "Scampering...",
  "Schlepping...",
  "Scurrying...",
  "Seasoning...",
  "Shenaniganing...",
  "Shimmying...",
  "Simmering...",
  "Skedaddling...",
  "Sketching...",
  "Slithering...",
  "Smooshing...",
  "Sock-hopping...",
  "Spelunking...",
  "Spinning...",
  "Sprouting...",
  "Stewing...",
  "Sublimating...",
  "Swirling...",
  "Swooping...",
  "Symbioting...",
  "Synthesizing...",
  "Tempering...",
  "Thinking...",
  "Thundering...",
  "Tinkering...",
  "Tomfoolering...",
  "Topsy-turvying...",
  "Transfiguring...",
  "Transmuting...",
  "Twisting...",
  "Undulating...",
  "Unfurling...",
  "Unravelling...",
  "Vibing...",
  "Waddling...",
  "Wandering...",
  "Warping...",
  "Whatchamacalliting...",
  "Whirlpooling...",
  "Whirring...",
  "Whisking...",
  "Wibbling...",
  "Working...",
  "Wrangling...",
  "Zesting...",
  "Zigzagging...",
];

function pickRandom(): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

// Base colors (coral → pink)
const COLORS: [number, number, number][] = [
	[233, 137, 115], // coral
	[228, 186, 103], // yellow
	[141, 192, 122], // green
	[102, 194, 179], // teal
	[121, 157, 207], // blue
	[157, 134, 195], // purple
	[206, 130, 172], // pink
];
const SHINE_COLOR: [number, number, number] = [129, 161, 193]; // Nord footer tokens blue
const RESET = "\x1b[0m";
const ANIM_INTERVAL_MS = 60;
const CYCLE_LENGTH = 20;
const SHINE_SPAN = 10;

function brighten(rgb: [number, number, number], factor: number): string {
	const [r, g, b] = rgb.map((c) => Math.round(c + (255 - c) * factor));
	return `\x1b[38;2;${r};${g};${b}m`;
}

function colorizeRainbow(text: string, shinePos: number): string {
	return (
		[...text]
			.map((c, i) => {
				const baseColor = COLORS[i % COLORS.length]!;
				// 3-letter shine: center bright, adjacent dimmer
				let factor = 0;
				if (shinePos >= 0) {
					const dist = Math.abs(i - shinePos);
					if (dist === 0) factor = 0.7;
					else if (dist === 1) factor = 0.35;
				}
				return `${brighten(baseColor, factor)}${c}`;
			})
			.join("") + RESET
	);
}

function colorizeShineOnly(text: string, shinePos: number): string {
	let result = "";
	const chars = [...text];
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i]!;
		const dist = shinePos >= 0 ? Math.abs(i - shinePos) : -1;
		let factor = 0;
		if (dist === 0) factor = 0.45;
		else if (dist === 1) factor = 0.2;

		result += brighten(SHINE_COLOR, factor);
		if (dist >= 0 && dist <= 1) {
			result += `\x1b[1m${c}\x1b[22m`;
		} else {
			result += c;
		}
	}
	result += RESET;
	return result;
}

export default function (pi: ExtensionAPI) {
	let currentMessage: string | undefined;
	let mode: "shine" | "rainbow" = "shine";
	let frame: number = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let ctxRef: ExtensionContext | undefined;
	let supportsEffect: boolean = false;

	function renderFrame(): void {
		if (currentMessage === undefined) return;
		if (!supportsEffect) {
			ctxRef!.ui.setWorkingMessage(currentMessage);
			return;
		}
		const cycle = frame % CYCLE_LENGTH;
		const shinePos = cycle < SHINE_SPAN ? cycle : -1;
		const colorize = mode === "rainbow" ? colorizeRainbow : colorizeShineOnly;
		const styled = colorize(currentMessage, shinePos);
		try {
			ctxRef!.ui.setWorkingMessage(styled);
		} catch {
			supportsEffect = false;
			stopAnimation();
			ctxRef!.ui.setWorkingMessage(currentMessage);
		}
	}

	function startAnimation(): void {
		if (timer) return;
		if (!supportsEffect) return;
		frame = 0;
		renderFrame();
		timer = setInterval(() => {
			frame++;
			renderFrame();
		}, ANIM_INTERVAL_MS);
	}

	function stopAnimation(): void {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
	}

	pi.on("session_start", (_event, ctx) => {
		ctxRef = ctx;
		supportsEffect = ctx.hasUI;
	});

	pi.on("turn_start", (_event, ctx) => {
		ctxRef = ctx;
		supportsEffect = ctx.hasUI;
		currentMessage = pickRandom();
		mode = "shine";
		frame = 0;
		if (supportsEffect) {
			startAnimation();
		} else {
			ctxRef.ui.setWorkingMessage(currentMessage);
		}
	});

	pi.on("message_update", (event, ctx) => {
		ctxRef = ctx;
		const type = (event as any).assistantMessageEvent?.type;
		if (type === "thinking_start") {
			mode = "rainbow";
			renderFrame();
		} else if (type === "thinking_end") {
			mode = "shine";
			renderFrame();
		}
	});

	pi.on("turn_end", (_event, ctx) => {
		stopAnimation();
		ctx.ui.setWorkingMessage();
		currentMessage = undefined;
		mode = "shine";
	});

	pi.on("session_shutdown", (_event, _ctx) => {
		stopAnimation();
		currentMessage = undefined;
		mode = "shine";
		ctxRef = undefined;
	});
}
