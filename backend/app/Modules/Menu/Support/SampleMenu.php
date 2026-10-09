<?php

namespace App\Modules\Menu\Support;

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

    /** Creates the sample menu for the tenant in context. Returns the number of items created. */
    public static function install(string $key): int
    {
        $count = 0;
        foreach (self::MENUS[$key] as $ci => [$name, $nameHi, $items]) {
            $category = MenuCategory::create([
                'name' => $name,
                'name_hi' => $nameHi,
                'slug' => Str::slug($name),
                'sort_order' => $ci + 1,
                'is_demo' => true,
            ]);
            foreach ($items as $ii => [$item, $itemHi, $desc, $price, $type, $spice, $best, $special]) {
                MenuItem::create([
                    'menu_category_id' => $category->id,
                    'name' => $item,
                    'name_hi' => $itemHi,
                    'description' => $desc,
                    'price' => $price,
                    'food_type' => $type,
                    'spice_level' => $spice,
                    'is_bestseller' => $best,
                    'is_chefs_special' => $special,
                    'sort_order' => $ii + 1,
                    'is_demo' => true,
                ]);
                $count++;
            }
        }

        return $count;
    }
}
