<?php

namespace App\Modules\Menu\Support;

use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use Illuminate\Support\Str;

/**
 * DEMO DATA: a small starter menu per business type. Every row is flagged
 * is_demo and shown with a "Demo" label on the site and in the dashboard
 * until the owner replaces it. Prices are placeholders, not market claims.
 */
final class SampleMenu
{
    // [category, category_hi, [[name, name_hi, description, price, food_type, spice, bestseller, chefs_special], ...]]
    private const MENUS = [
        'restaurant' => [
            ['Starters', 'स्टार्टर्स', [
                ['Paneer Tikka', 'पनीर टिक्का', 'Cottage cheese cubes marinated in yoghurt and spices, cooked in the tandoor.', 280, 'veg', 2, true, false],
                ['Hara Bhara Kabab', 'हरा भरा कबाब', 'Spinach, peas and potato patties.', 240, 'veg', 1, false, false],
                ['Chicken Tikka', 'चिकन टिक्का', 'Boneless chicken marinated overnight, charred in the tandoor.', 340, 'non_veg', 2, false, false],
            ]],
            ['Main Course', 'मेन कोर्स', [
                ['Dal Makhani', 'दाल मखनी', 'Black lentils slow-cooked with butter and cream.', 260, 'veg', 1, true, false],
                ['Paneer Butter Masala', 'पनीर बटर मसाला', 'Paneer in a mild tomato and butter gravy.', 300, 'veg', 1, false, false],
                ['Laal Maas', 'लाल मांस', 'Rajasthani mutton curry with mathania chillies.', 420, 'non_veg', 3, false, true],
                ['Butter Chicken', 'बटर चिकन', 'Tandoori chicken in a creamy tomato gravy.', 380, 'non_veg', 1, true, false],
            ]],
            ['Breads & Rice', 'रोटी और चावल', [
                ['Butter Naan', 'बटर नान', null, 60, 'veg', 0, false, false],
                ['Tandoori Roti', 'तंदूरी रोटी', null, 30, 'veg', 0, false, false],
                ['Jeera Rice', 'जीरा राइस', 'Basmati rice tempered with cumin.', 160, 'veg', 0, false, false],
            ]],
            ['Desserts', 'मिठाई', [
                ['Gulab Jamun', 'गुलाब जामुन', 'Two warm dumplings in rose-cardamom syrup.', 120, 'veg', 0, false, false],
                ['Kesar Kulfi', 'केसर कुल्फी', 'Saffron and pistachio kulfi.', 140, 'veg', 0, false, true],
            ]],
        ],
        'cafe' => [
            ['Coffee', 'कॉफ़ी', [
                ['Cappuccino', 'कैपुचीनो', 'Double shot with steamed milk.', 180, 'veg', 0, true, false],
                ['South Indian Filter Coffee', 'फ़िल्टर कॉफ़ी', 'Chicory blend, served in a davara.', 120, 'veg', 0, false, false],
                ['Cold Brew', 'कोल्ड ब्रू', 'Steeped for 16 hours, served over ice.', 220, 'veg', 0, false, true],
            ]],
            ['All-Day Breakfast', 'नाश्ता', [
                ['Masala Omelette', 'मसाला ऑमलेट', 'Three eggs, onion, tomato, green chilli, with toast.', 220, 'egg', 1, true, false],
                ['Avocado Toast', 'एवोकाडो टोस्ट', 'Sourdough, smashed avocado, chilli flakes.', 320, 'veg', 1, false, false],
                ['Granola Bowl', 'ग्रानोला बाउल', 'House granola, curd, seasonal fruit, honey.', 260, 'veg', 0, false, false],
            ]],
            ['Bakes', 'बेक्स', [
                ['Banana Bread', 'बनाना ब्रेड', null, 150, 'egg', 0, false, false],
                ['Butter Croissant', 'बटर क्रोसां', null, 160, 'veg', 0, false, false],
            ]],
        ],
        'street' => [
            ['Chaat', 'चाट', [
                ['Pani Puri', 'पानी पूरी', 'Six puris, spiced potato, tangy mint water.', 80, 'veg', 2, true, false],
                ['Papdi Chaat', 'पापड़ी चाट', 'Crisp papdi, curd, chutneys, sev.', 100, 'veg', 1, false, false],
                ['Dahi Puri', 'दही पूरी', null, 110, 'veg', 1, false, false],
            ]],
            ['Rolls', 'रोल्स', [
                ['Paneer Kathi Roll', 'पनीर काठी रोल', 'Paratha roll with spiced paneer and onions.', 160, 'veg', 2, false, false],
                ['Egg Roll', 'एग रोल', 'Kolkata-style egg paratha roll.', 130, 'egg', 1, true, false],
                ['Chicken Roll', 'चिकन रोल', null, 180, 'non_veg', 2, false, false],
            ]],
            ['Pav & Fries', 'पाव और फ्राइज़', [
                ['Vada Pav', 'वड़ा पाव', 'Potato fritter in pav with dry garlic chutney.', 50, 'veg', 2, true, false],
                ['Pav Bhaji', 'पाव भाजी', 'Buttery mashed vegetable curry with two pavs.', 140, 'veg', 1, false, true],
                ['Masala Fries', 'मसाला फ्राइज़', null, 120, 'veg', 1, false, false],
            ]],
            ['Coolers', 'ठंडा', [
                ['Masala Chaas', 'मसाला छाछ', null, 60, 'veg', 0, false, false],
                ['Kala Khatta Gola', 'काला खट्टा गोला', 'Shaved ice with kala khatta syrup.', 80, 'veg', 0, false, false],
            ]],
        ],
    ];

    public static function keyFor(string $businessType): string
    {
        return match ($businessType) {
            'cafe' => 'cafe',
            'cloud_kitchen' => 'street',
            default => 'restaurant',
        };
    }

    // Dish => [[variant, variant_hi, price], ...] (the first is the default).
    private const VARIANTS = [
        'Dal Makhani' => [['Half', 'हाफ़', 180], ['Full', 'फ़ुल', 260]],
        'Paneer Butter Masala' => [['Half', 'हाफ़', 190], ['Full', 'फ़ुल', 300]],
        'Butter Chicken' => [['Half', 'हाफ़', 230], ['Full', 'फ़ुल', 380]],
        'Cappuccino' => [['Regular', 'रेगुलर', 180], ['Large', 'लार्ज', 220]],
        'Cold Brew' => [['Regular', 'रेगुलर', 220], ['Large', 'लार्ज', 260]],
        'Pani Puri' => [['6 pcs', '6 पीस', 80], ['12 pcs', '12 पीस', 150]],
    ];

    // Menu key => [[group, group_hi, min, max, [[addon, addon_hi, price, food_type]], [dishes]]]
    private const ADDONS = [
        'restaurant' => [
            ['Extras', 'एक्स्ट्रा', 0, 3, [['Extra butter', 'एक्स्ट्रा बटर', 20, 'veg'], ['Extra paneer', 'एक्स्ट्रा पनीर', 60, 'veg'], ['Boondi raita', 'बूंदी रायता', 70, 'veg']],
                ['Dal Makhani', 'Paneer Butter Masala', 'Butter Chicken', 'Laal Maas']],
        ],
        'cafe' => [
            ['Milk', 'दूध', 0, 1, [['Oat milk', 'ओट मिल्क', 50, 'veg'], ['Almond milk', 'बादाम मिल्क', 50, 'veg']], ['Cappuccino', 'Cold Brew']],
            ['Extra shot', 'एक्स्ट्रा शॉट', 0, 1, [['Extra espresso shot', 'एक्स्ट्रा एस्प्रेसो शॉट', 40, 'veg']], ['Cappuccino', 'Cold Brew']],
        ],
        'street' => [
            ['Make it loaded', 'और मज़ेदार बनाएँ', 0, 3, [['Extra cheese', 'एक्स्ट्रा चीज़', 25, 'veg'], ['Extra butter', 'एक्स्ट्रा बटर', 15, 'veg'], ['Extra sev', 'एक्स्ट्रा सेव', 10, 'veg']],
                ['Vada Pav', 'Pav Bhaji', 'Paneer Kathi Roll', 'Masala Fries']],
        ],
    ];

    /**
     * Creates the sample menu for the tenant in context. Returns the number of items created.
     *
     * @param  (callable(string): ?array)|null  $photo  dish slug → stored image payload (demo businesses only)
     */
    public static function install(string $key, ?callable $photo = null): int
    {
        $count = 0;
        $created = [];
        foreach (self::MENUS[$key] as $ci => [$name, $nameHi, $items]) {
            $category = MenuCategory::create([
                'name' => $name,
                'name_hi' => $nameHi,
                'slug' => Str::slug($name),
                'sort_order' => $ci + 1,
                'is_demo' => true,
            ]);
            foreach ($items as $ii => [$item, $itemHi, $desc, $price, $type, $spice, $best, $special]) {
                $variants = self::VARIANTS[$item] ?? [];
                $menuItem = MenuItem::create([
                    'menu_category_id' => $category->id,
                    'name' => $item,
                    'name_hi' => $itemHi,
                    'description' => $desc,
                    'price' => $variants ? $variants[0][2] : $price,
                    'food_type' => $type,
                    'spice_level' => $spice,
                    'is_bestseller' => $best,
                    'is_chefs_special' => $special,
                    'image' => $photo ? $photo(Str::slug($item)) : null,
                    'sort_order' => $ii + 1,
                    'is_demo' => true,
                ]);
                foreach ($variants as $vi => [$vName, $vHi, $vPrice]) {
                    ItemVariant::create(['menu_item_id' => $menuItem->id, 'name' => $vName, 'name_hi' => $vHi, 'price' => $vPrice, 'is_default' => $vi === 0, 'sort_order' => $vi]);
                }
                $created[$item] = $menuItem;
                $count++;
            }
        }

        foreach (self::ADDONS[$key] as $gi => [$group, $groupHi, $min, $max, $addons, $dishes]) {
            $g = AddonGroup::create(['name' => $group, 'name_hi' => $groupHi, 'min_select' => $min, 'max_select' => $max, 'sort_order' => $gi + 1, 'is_demo' => true]);
            foreach ($addons as $ai => [$aName, $aHi, $aPrice, $aType]) {
                $g->addons()->create(['name' => $aName, 'name_hi' => $aHi, 'price' => $aPrice, 'food_type' => $aType, 'sort_order' => $ai]);
            }
            foreach ($dishes as $dish) {
                if (isset($created[$dish])) {
                    $created[$dish]->addonGroups()->attach($g->id, ['tenant_id' => $g->tenant_id, 'sort_order' => $gi]);
                }
            }
        }

        return $count;
    }
}
