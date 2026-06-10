require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY_MS = 150;

// Detect language from actual content — Hebrew Unicode block ratio
function detectLang(text) {
  const heCount    = (text.match(/[֐-׿יִ-ﭏ]/g) || []).length;
  const alphaCount = (text.match(/[a-zA-Z֐-׿יִ-ﭏ]/g) || []).length;
  if (alphaCount === 0) return 'he';
  return heCount / alphaCount > 0.25 ? 'he' : 'en';
}

// ─── gabaygroup.com pages — Hebrew only ──────────────────────────────────────

const GABAY_PAGES = [
  { url: 'https://gabaygroup.com/' },
  { url: 'https://gabaygroup.com/projects/' },
  { url: 'https://gabaygroup.com/urban-renewal/' },
  { url: 'https://gabaygroup.com/about/' },
  { url: 'https://gabaygroup.com/contact/' },
];

// ─── Definition sources ───────────────────────────────────────────────────────

const DEFINITION_SOURCES = [
  {
    id: 'dmlaw',
    url: 'https://dmlaw.co.il/מילון-מונחי-נדלן/',
    source_type: 'legal',
    lang: 'he',
    title: 'מילון מושגי נדל"ן – DM Law',
    strategy: 'li_items',
    selector: '.elementor-widget-text-editor li',  // site uses Elementor, not classic WP
  },
  {
    id: 'dkarka',
    url: 'https://dkarka.co.il/real-estate/מושגים-בנדלן/',
    source_type: 'investor',
    lang: 'he',
    title: 'מושגים בנדל"ן – DKarka',
    strategy: 'h3_para',   // h3 term + immediately following <p> definition
    selector: 'h3',
  },
  {
    id: 'igud',
    url: 'https://www.igud-nadlan.org/musagim/',
    source_type: 'association',
    lang: 'he',
    title: 'מושגים – איגוד הנדל"ן',
    strategy: 'heading_para',
    selector: '.elementor-widget-text-editor',
  },
  {
    id: 'nadlan',
    url: 'https://www.nadlancenter.co.il/article/1222',
    source_type: 'media',
    lang: 'he',
    title: 'מילון מושגי נדל"ן – Nadlan Center',
    strategy: 'article',
    selector: '.article_block p',   // actual article container on this site
  },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  return response.data;
}

// ─── gabaygroup.com scraper ───────────────────────────────────────────────────

async function scrapeGabayPage(pageInfo) {
  console.log(`  Scraping: ${pageInfo.url}`);
  try {
    const html = await fetchHtml(pageInfo.url);
    const $ = cheerio.load(html);

    const title =
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      pageInfo.url;

    // Remove structural noise
    $(
      'nav, footer, script, style, header, #wpadminbar, .elementor-hidden, ' +
      '.wp-block-navigation, [class*="elementor-nav"], [class*="-menu"], ' +
      '[class*="cookie"], [class*="popup"], [class*="breadcrumb"]'
    ).remove();

    let text = '';

    // Try selectors in priority order (spec: main, article, .elementor-widget-container)
    const primary = $('main').length ? $('main') : $('article').length ? $('article') : null;

    if (primary && primary.text().trim().length > 200) {
      text = primary.text();
    } else {
      // Gather leaf-level Elementor widget containers to avoid duplicate nesting
      const seen = new Set();
      $('.elementor-widget-container').each((_, el) => {
        // Skip containers that themselves contain other widget containers
        if ($(el).find('.elementor-widget-container').length > 0) return;
        const t = $(el).text().trim();
        const key = t.slice(0, 80);
        if (t.length > 40 && !seen.has(key)) {
          seen.add(key);
          text += t + '\n\n';
        }
      });
    }

    // Ultimate fallback
    if (text.trim().length < 200) {
      text = $('body').text();
    }

    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < 200) {
      console.log(`    Skipping (too short): ${pageInfo.url}`);
      return null;
    }

    return {
      url: pageInfo.url,
      lang: 'he',   // all scraped URLs are Hebrew pages
      title,
      source_type: 'company',
      text,
    };
  } catch (err) {
    console.error(`    Error: ${err.message}`);
    return null;
  }
}

// ─── Definition extractors ────────────────────────────────────────────────────

// dmlaw.co.il: each <li> is one definition
function extractLiItems($, selector, meta) {
  const chunks = [];
  $(selector).each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length < 30) return;
    const dashMatch = text.match(/^([^–—\-]+)[–—\-]\s*(.+)/s);
    // Fall back to first 5 words when no separator found (still a valid entry)
    const term = dashMatch
      ? dashMatch[1].trim()
      : text.split(/\s+/).slice(0, 5).join(' ');
    chunks.push({ ...meta, term, text });
  });
  return chunks;
}

// dkarka / igud: heading followed by paragraph(s) = one definition
function extractHeadingPara($, containerSelector, meta) {
  const chunks = [];
  $(containerSelector).each((_, container) => {
    let currentTerm = '';
    let currentBody = '';

    $(container)
      .find('h2, h3, p')
      .each((_, el) => {
        const tag = el.tagName.toLowerCase();
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (!text) return;

        if (tag === 'h2' || tag === 'h3') {
          if (currentTerm && currentBody.trim()) {
            chunks.push({
              ...meta,
              term: currentTerm,
              text: `${currentTerm} – ${currentBody.trim()}`,
            });
          }
          currentTerm = text;
          currentBody = '';
        } else {
          currentBody += text + ' ';
        }
      });

    if (currentTerm && currentBody.trim()) {
      chunks.push({
        ...meta,
        term: currentTerm,
        text: `${currentTerm} – ${currentBody.trim()}`,
      });
    }
  });
  return chunks;
}

// dkarka: h3 term + immediately following <p> sibling = one definition
function extractH3Para($, meta) {
  const chunks = [];
  $('h3').each((_, el) => {
    const term = $(el).text().trim().replace(/\s+/g, ' ');
    if (!term || term.length < 2) return;
    const body = $(el).next('p').text().trim().replace(/\s+/g, ' ');
    if (body.length < 20) return;
    chunks.push({ ...meta, term, text: `${term} – ${body}` });
  });
  return chunks;
}

// nadlancenter: article body as a single text block (chunked later in ingest)
function extractArticleBody($, selector, meta) {
  let text = '';
  $(selector).each((_, el) => {
    text += $(el).text().trim() + '\n';
  });
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length < 30) return [];
  return [{ ...meta, term: '', text }];
}

async function scrapeDefinitionSource(source) {
  console.log(`  Scraping: ${source.url}`);
  try {
    const html = await fetchHtml(source.url);
    const $ = cheerio.load(html);

    const meta = {
      url: source.url,
      lang: source.lang,
      title: source.title,
      source_type: source.source_type,
    };

    let chunks = [];
    if (source.strategy === 'li_items') {
      chunks = extractLiItems($, source.selector, meta);
    } else if (source.strategy === 'heading_para') {
      chunks = extractHeadingPara($, source.selector, meta);
    } else if (source.strategy === 'h3_para') {
      chunks = extractH3Para($, meta);
    } else if (source.strategy === 'article') {
      chunks = extractArticleBody($, source.selector, meta);
    }

    console.log(`    Found ${chunks.length} definition entries`);
    return chunks;
  } catch (err) {
    console.error(`    Error: ${err.message}`);
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Gabay Group Scraper ===\n');

  // Phase 1 — company pages
  console.log('Phase 1: gabaygroup.com...');
  const gabayPages = [];
  for (const page of GABAY_PAGES) {
    const result = await scrapeGabayPage(page);
    if (result) gabayPages.push(result);
    await sleep(DELAY_MS);
  }
  console.log(`\n→ ${gabayPages.length} company pages collected.\n`);

  fs.writeFileSync(
    path.join(__dirname, 'scraped_gabay.json'),
    JSON.stringify(gabayPages, null, 2),
    'utf8'
  );
  console.log('Saved scraped_gabay.json\n');

  // Phase 2 — definition sources
  console.log('Phase 2: Definition sources...');
  const allDefinitions = [];
  for (const source of DEFINITION_SOURCES) {
    const chunks = await scrapeDefinitionSource(source);
    allDefinitions.push(...chunks);
    await sleep(DELAY_MS);
  }
  console.log(`\n→ ${allDefinitions.length} definition chunks collected.\n`);

  fs.writeFileSync(
    path.join(__dirname, 'scraped_definitions.json'),
    JSON.stringify(allDefinitions, null, 2),
    'utf8'
  );
  console.log('Saved scraped_definitions.json\n');

  console.log('=== Scraping complete ===');
  console.log(`Company pages:      ${gabayPages.length}`);
  console.log(`Definition entries: ${allDefinitions.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
