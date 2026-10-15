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
        // Used by the demo businesses for the Ember, Kulhad and Modern QSR themes.
        'grill' => [
            ['From the Tandoor', 'तंदूर से', [
                ['Tandoori Chicken', 'तंदूरी चिकन', 'Half bird, yoghurt and Kashmiri chilli marinade, charred over coal.', 420, 'non_veg', 2, true, false],
                ['Malai Paneer Tikka', 'मलाई पनीर टिक्का', 'Paneer in a cream and cardamom marinade.', 340, 'veg', 1, false, false],
                ['Seekh Kebab', 'सीख कबाब', 'Minced lamb with ginger and green chilli on skewers.', 460, 'non_veg', 2, false, true],
                ['Tandoori Prawns', 'तंदूरी झींगे', 'Prawns with ajwain and garlic, finished with lime.', 560, 'non_veg', 2, false, false],
            ]],
            ['Small Plates', 'स्मॉल प्लेट्स', [
                ['Amritsari Fish', 'अमृतसरी मछली', 'Gram-flour battered fish with chaat masala.', 440, 'non_veg', 2, false, false],
                ['Dahi Ke Kebab', 'दही के कबाब', 'Hung-curd kebabs with a crisp crust.', 300, 'veg', 1, false, false],
            ]],
            ['Mains', 'मेन', [
                ['Mutton Rogan Josh', 'मटन रोगन जोश', 'Lamb braised with Kashmiri chillies and fennel.', 580, 'non_veg', 2, true, false],
                ['Chicken Biryani', 'चिकन बिरयानी', 'Dum-cooked basmati and chicken with saffron.', 420, 'non_veg', 2, false, false],
                ['Dal Makhani', 'दाल मखनी', 'Black lentils slow-cooked overnight.', 320, 'veg', 1, false, false],
            ]],
            ['Coolers', 'ठंडा', [
                ['Mango Lassi', 'मैंगो लस्सी', null, 180, 'veg', 0, false, false],
                ['Fresh Lime Soda', 'फ़्रेश लाइम सोडा', null, 140, 'veg', 0, false, false],
            ]],
        ],
        'chai' => [
            ['Chai', 'चाय', [
                ['Kulhad Masala Chai', 'कुल्हड़ मसाला चाय', 'Ginger, cardamom and clove, served in a clay cup.', 60, 'veg', 0, true, false],
                ['Elaichi Chai', 'इलायची चाय', 'Milky chai with green cardamom.', 50, 'veg', 0, false, false],
                ['Kashmiri Kahwa', 'कश्मीरी कहवा', 'Green tea with saffron and almonds.', 120, 'veg', 0, false, true],
            ]],
            ['Snacks', 'नाश्ता', [
                ['Bun Maska', 'बन मस्का', 'Soft bun with plenty of butter.', 70, 'veg', 0, true, false],
                ['Samosa', 'समोसा', 'Two samosas with mint and tamarind chutney.', 60, 'veg', 1, false, false],
                ['Vada Pav', 'वड़ा पाव', null, 50, 'veg', 2, false, false],
                ['Poha', 'पोहा', 'Flattened rice with peanuts, curry leaves and lemon.', 90, 'veg', 1, false, false],
            ]],
            ['Sweets', 'मिठाई', [
                ['Gulab Jamun', 'गुलाब जामुन', null, 80, 'veg', 0, false, false],
                ['Jalebi', 'जलेबी', 'Crisp, syrupy and served warm.', 90, 'veg', 0, false, false],
                ['Rasmalai', 'रसमलाई', null, 120, 'veg', 0, false, false],
            ]],
        ],
        // South Indian and coastal (the Coastal theme's demo): tiffin, meals on a banana leaf, filter coffee.
        'south' => [
            ['Tiffin', 'टिफ़िन', [
                ['Masala Dosa', 'मसाला डोसा', 'Crisp rice-and-lentil dosa with potato masala, coconut chutney and sambar.', 120, 'veg', 1, true, false],
                ['Idli Vada', 'इडली वड़ा', 'Two steamed idlis and a crisp medu vada with sambar and chutneys.', 90, 'veg', 1, true, false],
                ['Neer Dosa', 'नीर डोसा', 'Soft, lacy Mangalorean rice dosas with coconut chutney.', 100, 'veg', 0, false, false],
                ['Appam with Vegetable Stew', 'अप्पम और वेजिटेबल स्टू', 'Two lace-edged appams with a mild coconut-milk stew.', 160, 'veg', 0, false, true],
            ]],
            ['Meals & Curries', 'मील्स और करी', [
                ['Kerala Fish Curry Meals', 'केरल फ़िश करी मील्स', 'Kerala rice, fish curry, thoran, sambar, rasam, pickle and pappadam on a banana leaf.', 280, 'non_veg', 2, true, false],
                ['Chicken Chettinad', 'चिकन चेट्टिनाड', 'Chicken in a roasted pepper, fennel and coconut masala.', 320, 'non_veg', 3, false, false],
                ['Kerala Prawn Roast', 'केरल प्रॉन रोस्ट', 'Prawns roasted with shallots, curry leaves, pepper and coconut oil.', 420, 'non_veg', 2, false, true],
            ]],
            ['Parotta & Rice', 'परोटा और चावल', [
                ['Kerala Parotta', 'केरल परोटा', 'Flaky, layered flatbread.', 40, 'veg', 0, false, false],
                ['Lemon Rice', 'लेमन राइस', 'Rice tempered with mustard, curry leaves, peanuts and lime.', 120, 'veg', 1, false, false],
                ['Curd Rice', 'कर्ड राइस', 'Cool curd rice with a mustard and ginger tempering.', 110, 'veg', 0, false, false],
            ]],
            ['Coffee & Sweets', 'कॉफ़ी और मिठाई', [
                ['Filter Coffee', 'फ़िल्टर कॉफ़ी', 'Chicory blend, frothed and served in a davara and tumbler.', 50, 'veg', 0, true, false],
                ['Palada Payasam', 'पालड़ा पायसम', 'Rice flakes slow-cooked in sweetened milk.', 110, 'veg', 0, false, false],
            ]],
        ],
        'qsr' => [
            ['Burgers', 'बर्गर', [
                ['Classic Veg Burger', 'क्लासिक वेज बर्गर', 'Crisp veg patty, lettuce, tomato, house sauce.', 149, 'veg', 0, true, false],
                ['Paneer Tikka Burger', 'पनीर टिक्का बर्गर', 'Tandoori paneer, mint mayo, onions.', 189, 'veg', 1, false, false],
                ['Crispy Chicken Burger', 'क्रिस्पी चिकन बर्गर', 'Fried chicken, slaw, pickles.', 199, 'non_veg', 1, true, false],
            ]],
            ['Pizza', 'पिज़्ज़ा', [
                ['Margherita', 'मार्गेरिटा', 'Tomato, mozzarella, basil.', 249, 'veg', 0, false, false],
                ['Tandoori Paneer Pizza', 'तंदूरी पनीर पिज़्ज़ा', 'Paneer tikka, peppers, onion.', 329, 'veg', 1, false, true],
                ['Pepperoni Pizza', 'पेपरोनी पिज़्ज़ा', null, 379, 'non_veg', 1, false, false],
            ]],
            ['Sides', 'साइड्स', [
                ['French Fries', 'फ़्रेंच फ़्राइज़', null, 99, 'veg', 0, false, false],
                ['Garlic Bread', 'गार्लिक ब्रेड', null, 129, 'veg', 0, false, false],
            ]],
            ['Drinks', 'ड्रिंक्स', [
                ['Cold Coffee', 'कोल्ड कॉफ़ी', null, 129, 'veg', 0, false, false],
                ['Chocolate Shake', 'चॉकलेट शेक', null, 149, 'veg', 0, false, false],
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
        'Tandoori Chicken' => [['Half', 'हाफ़', 420], ['Full', 'फ़ुल', 760]],
        'Chicken Biryani' => [['Regular', 'रेगुलर', 420], ['Family', 'फ़ैमिली', 790]],
        'Kulhad Masala Chai' => [['Small', 'छोटा', 60], ['Large', 'बड़ा', 90]],
        'Margherita' => [['Regular', 'रेगुलर', 249], ['Medium', 'मीडियम', 399]],
        'Tandoori Paneer Pizza' => [['Regular', 'रेगुलर', 329], ['Medium', 'मीडियम', 499]],
        'Pepperoni Pizza' => [['Regular', 'रेगुलर', 379], ['Medium', 'मीडियम', 549]],
        'Kerala Parotta' => [['1 pc', '1 पीस', 40], ['2 pcs', '2 पीस', 75]],
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
        'grill' => [
            ['Sides', 'साइड्स', 0, 2, [['Butter naan', 'बटर नान', 70, 'veg'], ['Laccha paratha', 'लच्छा पराठा', 80, 'veg'], ['Mint chutney (extra)', 'पुदीना चटनी', 20, 'veg']],
                ['Tandoori Chicken', 'Malai Paneer Tikka', 'Seekh Kebab', 'Mutton Rogan Josh']],
        ],
        'chai' => [
            ['Add-ons', 'ऐड-ऑन', 0, 2, [['Extra ginger', 'एक्स्ट्रा अदरक', 10, 'veg'], ['Less sugar', 'कम चीनी', 0, 'veg']], ['Kulhad Masala Chai', 'Elaichi Chai']],
        ],
        'south' => [
            ['Extras', 'एक्स्ट्रा', 0, 3, [['Extra sambar', 'एक्स्ट्रा सांभर', 20, 'veg'], ['Extra coconut chutney', 'एक्स्ट्रा नारियल चटनी', 15, 'veg'], ['Gunpowder podi with ghee', 'घी के साथ पोडी', 25, 'veg']],
                ['Masala Dosa', 'Idli Vada', 'Neer Dosa']],
        ],
        'qsr' => [
            ['Make it a meal', 'मील बनाएँ', 0, 1, [['Fries + soft drink', 'फ़्राइज़ + सॉफ़्ट ड्रिंक', 99, 'veg'], ['Fries + Cold coffee', 'फ़्राइज़ + कोल्ड कॉफ़ी', 129, 'veg']],
                ['Classic Veg Burger', 'Paneer Tikka Burger', 'Crispy Chicken Burger']],
            ['Extra toppings', 'एक्स्ट्रा टॉपिंग', 0, 3, [['Extra cheese', 'एक्स्ट्रा चीज़', 49, 'veg'], ['Jalapeños', 'हालापेन्यो', 39, 'veg'], ['Olives', 'ऑलिव्स', 39, 'veg']],
                ['Margherita', 'Tandoori Paneer Pizza', 'Pepperoni Pizza']],
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
