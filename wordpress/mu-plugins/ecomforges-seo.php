<?php
/**
 * Plugin Name: EcomForges — titles, social previews and structured data
 * Description: Emits the document title, meta description, Open Graph / Twitter tags and
 *              JSON-LD. The FAQ schema is read out of the Breakdance FAQ element on the page
 *              itself, so editing an answer in the builder updates the markup with it.
 * Version:     1.0.0
 * Author:      EcomForges
 *
 * Deployed to wp-content/mu-plugins/. Source of truth is the ECOMFORGES repository at
 * wordpress/mu-plugins/ecomforges-seo.php — edit there, not on the server.
 *
 * To disable everything this file does, delete it. Nothing else on the site depends on it.
 */

if (!defined('ABSPATH')) {
    exit;
}

/* -------------------------------------------------------------------------
 * CONFIG — the only part you should normally need to edit.
 * ---------------------------------------------------------------------- */

function ef_seo_config(): array {
    return [
        'brand'        => 'EcomForges',

        // Front page. Aim for ~55 characters of title and ~155 of description.
        'home_title'   => 'E-commerce Advisory for Shopee, Lazada & TikTok Sellers',
        'home_desc'    => 'We find the one thing holding your store back this month and tell you '
                        . 'exactly what to do about it. Advisory for Malaysian sellers on Shopee, '
                        . 'Lazada, TikTok Shop, Shopify and WooCommerce.',

        // Used on any page that has no description of its own.
        'default_desc' => 'E-commerce advisory for Malaysian SME sellers. A diagnosis from your own '
                        . 'platform data and a 30-day sprint, every cycle. Your team executes.',

        'locale'       => 'en_MY',
        'twitter_card' => 'summary_large_image',

        // Shown in Organization schema. Add profile URLs as they go live.
        'same_as'      => [],
        'whatsapp'     => 'https://wa.me/601153767895',
        'area_served'  => 'MY',
    ];
}

/* -------------------------------------------------------------------------
 * Reading the FAQ out of the page's own Breakdance data.
 * ---------------------------------------------------------------------- */

/**
 * Every question/answer pair from every Breakdance FAQ element on a post.
 *
 * Breakdance stores its tree as JSON inside JSON: the `_breakdance_data` meta holds
 * {"tree_json_string": "<the actual tree>"}. Only the `items` array renders on the front
 * end — older versions of the element left a stale `questions` array behind, which is
 * deliberately ignored here so retired copy can never reappear in the markup.
 *
 * @return array<int, array{q: string, a: string}>
 */
function ef_seo_faq_items(int $post_id): array {
    $raw = get_post_meta($post_id, '_breakdance_data', true);
    if (!is_string($raw) || $raw === '') {
        return [];
    }

    $outer = json_decode($raw, true);
    if (!is_array($outer) || empty($outer['tree_json_string'])) {
        return [];
    }

    $tree = json_decode($outer['tree_json_string'], true);
    if (!is_array($tree) || empty($tree['root'])) {
        return [];
    }

    $allowed = [
        'p' => [], 'br' => [], 'strong' => [], 'em' => [], 'b' => [], 'i' => [],
        'ul' => [], 'ol' => [], 'li' => [], 'a' => ['href' => [], 'title' => []],
    ];

    $items = [];
    $stack = [$tree['root']];

    while ($stack) {
        $node = array_pop($stack);
        if (!is_array($node)) {
            continue;
        }

        if (($node['data']['type'] ?? '') === 'EssentialElements\\FrequentlyAskedQuestions') {
            $settings = $node['data']['properties']['content']['settings']['items'] ?? [];
            foreach ($settings as $item) {
                $question = trim(wp_strip_all_tags((string) ($item['question'] ?? '')));
                $answer   = trim(wp_kses(strip_shortcodes((string) ($item['answer'] ?? '')), $allowed));

                // A shortcode that survived stripping means the answer is bound to dynamic
                // data we cannot resolve here. Skip it rather than publish a raw shortcode.
                if ($question === '' || $answer === '' || strpos($answer, '[') !== false) {
                    continue;
                }
                $items[] = ['q' => $question, 'a' => $answer];
            }
        }

        foreach ($node['children'] ?? [] as $child) {
            $stack[] = $child;
        }
    }

    return $items;
}

/* -------------------------------------------------------------------------
 * Title and description for the current request.
 * ---------------------------------------------------------------------- */

function ef_seo_title(): string {
    $config = ef_seo_config();

    if (is_front_page()) {
        return $config['home_title'] . ' | ' . $config['brand'];
    }
    if (is_singular()) {
        return get_the_title() . ' | ' . $config['brand'];
    }
    if (is_search()) {
        return 'Search: ' . get_search_query() . ' | ' . $config['brand'];
    }
    if (is_404()) {
        return 'Page not found | ' . $config['brand'];
    }

    return wp_get_document_title();
}

/** Strip markup, decode entities, collapse whitespace and trim to a sane length. */
function ef_seo_clean_description(string $text): string {
    $text = wp_strip_all_tags(strip_shortcodes($text));
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim((string) preg_replace('/\s+/u', ' ', $text));

    return wp_trim_words($text, 32, '…');
}

function ef_seo_description(): string {
    $config = ef_seo_config();

    if (is_front_page()) {
        return $config['home_desc'];
    }

    if (is_singular()) {
        $post_id = get_queried_object_id();

        // A per-page override, so a description can be set without touching this file.
        $custom = get_post_meta($post_id, '_ef_seo_description', true);
        if (is_string($custom) && trim($custom) !== '') {
            return trim($custom);
        }

        // Breakdance pages have no post_content, so prefer the FAQ over a scraped excerpt.
        $faq = ef_seo_faq_items($post_id);
        if ($faq) {
            return ef_seo_clean_description($faq[0]['a']);
        }

        $excerpt = ef_seo_clean_description((string) get_the_excerpt($post_id));
        // A short excerpt is usually scraped interface text ("Step 1 of 7 Welcome…"),
        // which reads worse in a search result than the site's own sentence.
        if (mb_strlen($excerpt) >= 60) {
            return $excerpt;
        }
    }

    return $config['default_desc'];
}

/**
 * The 1200x630 share image, as [url, width, height] — or null when none is set.
 * Set the attachment id in the `ef_seo_og_image_id` option to change it.
 */
function ef_seo_share_image(): ?array {
    $id = (int) get_option('ef_seo_og_image_id', 0);
    if ($id <= 0) {
        $id = (int) get_option('site_icon', 0);
    }
    if ($id <= 0) {
        return null;
    }

    $src = wp_get_attachment_image_src($id, 'full');
    if (!$src || empty($src[0])) {
        return null;
    }

    return [$src[0], (int) $src[1], (int) $src[2]];
}

/* -------------------------------------------------------------------------
 * Output.
 * ---------------------------------------------------------------------- */

add_filter('pre_get_document_title', 'ef_seo_title', 20);

add_action('wp_head', 'ef_seo_head', 5);

function ef_seo_head(): void {
    $config = ef_seo_config();
    $desc   = ef_seo_description();
    $url    = is_singular() ? get_permalink() : home_url(add_query_arg([], $GLOBALS['wp']->request ?? ''));
    $title  = ef_seo_title();
    $image  = ef_seo_share_image();

    echo "\n<!-- EcomForges SEO -->\n";

    printf('<meta name="description" content="%s">' . "\n", esc_attr($desc));

    printf('<meta property="og:type" content="%s">' . "\n", is_front_page() ? 'website' : 'article');
    printf('<meta property="og:site_name" content="%s">' . "\n", esc_attr($config['brand']));
    printf('<meta property="og:locale" content="%s">' . "\n", esc_attr($config['locale']));
    printf('<meta property="og:title" content="%s">' . "\n", esc_attr($title));
    printf('<meta property="og:description" content="%s">' . "\n", esc_attr($desc));
    printf('<meta property="og:url" content="%s">' . "\n", esc_url($url));

    printf('<meta name="twitter:card" content="%s">' . "\n", esc_attr($config['twitter_card']));
    printf('<meta name="twitter:title" content="%s">' . "\n", esc_attr($title));
    printf('<meta name="twitter:description" content="%s">' . "\n", esc_attr($desc));

    if ($image) {
        printf('<meta property="og:image" content="%s">' . "\n", esc_url($image[0]));
        printf('<meta property="og:image:width" content="%d">' . "\n", $image[1]);
        printf('<meta property="og:image:height" content="%d">' . "\n", $image[2]);
        printf('<meta property="og:image:alt" content="%s">' . "\n", esc_attr($config['brand']));
        printf('<meta name="twitter:image" content="%s">' . "\n", esc_url($image[0]));
    }

    ef_seo_json_ld($config, $title, $desc, $url);

    echo "<!-- /EcomForges SEO -->\n\n";
}

function ef_seo_json_ld(array $config, string $title, string $desc, string $url): void {
    $home       = home_url('/');
    $org_id     = $home . '#organization';
    $website_id = $home . '#website';

    $organization = [
        '@type'       => 'Organization',
        '@id'         => $org_id,
        'name'        => $config['brand'],
        'url'         => $home,
        'description' => $config['default_desc'],
        'areaServed'  => $config['area_served'],
    ];

    if ($config['same_as']) {
        $organization['sameAs'] = array_values($config['same_as']);
    }

    if ($config['whatsapp']) {
        $organization['contactPoint'] = [[
            '@type'       => 'ContactPoint',
            'contactType' => 'sales',
            'url'         => $config['whatsapp'],
            'areaServed'  => $config['area_served'],
        ]];
    }

    // Breakdance replaces the theme, so the customizer's logo slot is usually empty.
    // Fall back to an explicit option, then to the site icon.
    $logo_id = (int) get_theme_mod('custom_logo');
    if (!$logo_id) {
        $logo_id = (int) get_option('ef_seo_logo_id', 0);
    }
    if (!$logo_id) {
        $logo_id = (int) get_option('site_icon', 0);
    }
    if ($logo_id) {
        $logo = wp_get_attachment_image_src($logo_id, 'full');
        if ($logo) {
            $organization['logo'] = [
                '@type'  => 'ImageObject',
                'url'    => $logo[0],
                'width'  => (int) $logo[1],
                'height' => (int) $logo[2],
            ];
        }
    }

    $graph = [
        $organization,
        [
            '@type'     => 'WebSite',
            '@id'       => $website_id,
            'url'       => $home,
            'name'      => $config['brand'],
            'publisher' => ['@id' => $org_id],
            'inLanguage' => get_bloginfo('language'),
        ],
        [
            '@type'       => 'WebPage',
            '@id'         => $url . '#webpage',
            'url'         => $url,
            'name'        => $title,
            'description' => $desc,
            'isPartOf'    => ['@id' => $website_id],
            'about'       => ['@id' => $org_id],
        ],
    ];

    // FAQPage, built from whatever the FAQ element currently holds.
    if (is_singular()) {
        $faq = ef_seo_faq_items(get_queried_object_id());
        if ($faq) {
            $graph[] = [
                '@type'      => 'FAQPage',
                '@id'        => $url . '#faq',
                'isPartOf'   => ['@id' => $url . '#webpage'],
                'mainEntity' => array_map(static function (array $item): array {
                    return [
                        '@type'          => 'Question',
                        'name'           => $item['q'],
                        'acceptedAnswer' => [
                            '@type' => 'Answer',
                            'text'  => $item['a'],
                        ],
                    ];
                }, $faq),
            ];
        }
    }

    $json = wp_json_encode(
        ['@context' => 'https://schema.org', '@graph' => $graph],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );

    if ($json) {
        echo '<script type="application/ld+json">' . $json . '</script>' . "\n";
    }
}
