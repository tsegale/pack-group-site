require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt  = require('bcryptjs');
const { getDb } = require('./database');

const db = getDb();

/* ── ADMIN USER ── */
const adminName  = process.env.ADMIN_NAME     || 'Pack Admin';
const adminEmail = process.env.ADMIN_EMAIL    || 'admin@packgroup.na';
const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existing) {
  const hash = bcrypt.hashSync(adminPass, 12);
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(adminName, adminEmail, hash);
  console.log(`✓ Admin user created: ${adminEmail}`);
} else {
  console.log(`  Admin user already exists: ${adminEmail}`);
}

/* ── HELPER ── */
function upsertProperty(data, images) {
  const existing = db.prepare('SELECT id FROM properties WHERE slug = ?').get(data.slug);
  let propId;
  if (existing) {
    console.log(`  Property already exists: ${data.title}`);
    propId = existing.id;
  } else {
    const res = db.prepare(`
      INSERT INTO properties
        (title, type, price, levy, bedrooms, bathrooms, location,
         description, status, units_available, rental_option,
         contact_phone, featured, slug)
      VALUES
        (@title, @type, @price, @levy, @bedrooms, @bathrooms, @location,
         @description, @status, @units_available, @rental_option,
         @contact_phone, @featured, @slug)
    `).run(data);
    propId = res.lastInsertRowid;
    console.log(`✓ Property created: ${data.title}`);
  }

  const hasImages = db.prepare('SELECT COUNT(*) as c FROM property_images WHERE property_id = ?').get(propId);
  if (hasImages.c === 0 && images.length > 0) {
    const insertImg = db.prepare(
      'INSERT INTO property_images (property_id, filename, sort_order, is_cover) VALUES (?, ?, ?, ?)'
    );
    images.forEach((img, i) => insertImg.run(propId, img.filename, i, i === 0 ? 1 : 0));
    console.log(`  → ${images.length} images added`);
  }
}

/* ── PROPERTIES ── */
upsertProperty({
  title:           'Shambo View',
  type:            'sale',
  price:           400000,
  levy:            '976.29',
  bedrooms:        2,
  bathrooms:       1,
  location:        'Okahandja, Namibia',
  description:     'Shambo View is a well-maintained residential complex located in Okahandja, offering a secure and comfortable lifestyle on the 1st floor. This 2-bedroom, 1-bathroom unit is an ideal entry point into the property market or a smart addition to any investment portfolio.\n\nWith tenants already in place, this is a turn-key investment opportunity, generating rental income from day one. The unit features a modern granite kitchen counter with built-in hob, tiled flooring throughout, and a full bathroom with bath, toilet and basin. The complex offers a shared balcony walkway with views over the courtyard.\n\nTwo units are available at the same price, making it possible to acquire both and maximise your investment return in this sought-after complex.',
  status:          'available',
  units_available: 2,
  rental_option:   0,
  contact_phone:   '0858196462',
  featured:        1,
  slug:            'shambo-view',
}, [
  { filename: 'assets/listing1/IMG1.jpeg' },
  { filename: 'assets/listing1/IMG2.jpeg' },
  { filename: 'assets/listing1/IMG3.jpeg' },
  { filename: 'assets/listing1/IMG4.jpeg' },
  { filename: 'assets/listing1/IMG5.png'  },
]);

upsertProperty({
  title:           'Paragon Court',
  type:            'sale',
  price:           1500000,
  levy:            '1606',
  bedrooms:        2,
  bathrooms:       1,
  location:        'Pioneerspark, Windhoek, Namibia',
  description:     'Paragon Court is a premium duplex apartment located in Pioneerspark, one of Windhoek\'s most sought-after residential areas. CC Registered with full ownership documentation.\n\nThis well-appointed unit features an en-suite bathroom, private garage, and access to a courtyard. The property is ideal for owner-occupiers or investors seeking a premium address in Windhoek\'s established northern suburbs.\n\nPioneerspark offers excellent access to shopping centres, schools, and major commuting routes. The property won\'t stay on the market long.',
  status:          'available',
  units_available: 1,
  rental_option:   0,
  contact_phone:   '0858196462',
  featured:        1,
  slug:            'paragon-court',
}, [
  { filename: 'assets/listing2/IMG_5074.jpeg' },
  { filename: 'assets/listing2/IMG_5075.jpeg' },
  { filename: 'assets/listing2/IMG_5083.jpeg' },
  { filename: 'assets/listing2/IMG_5087.jpeg' },
  { filename: 'assets/listing2/IMG_5088.jpeg' },
]);

upsertProperty({
  title:           'Bella Rosa',
  type:            'sale',
  price:           980000,
  levy:            null,
  bedrooms:        2,
  bathrooms:       1,
  location:        'Celsiana Court, Rocky Crest, Windhoek',
  description:     'Welcome to Bella Rosa, a modern and cosy apartment nestled within the secure Celsiana Court complex in the heart of Rocky Crest. Thoughtfully designed for comfortable everyday living, this property is the perfect choice for first-time buyers or investors looking for a move-in ready home in a prime Windhoek location.\n\nThe open-plan kitchen and lounge create a warm, connected living space ideal for relaxing or entertaining. The unit features two well-sized bedrooms, a full bathroom with both shower and bathtub, a private courtyard for outdoor enjoyment, and convenient shade-net parking.\n\nRocky Crest is a well-established suburb situated close to leading schools, major shopping centres, medical facilities and key commuting routes, making this an exceptionally practical and desirable address.',
  status:          'available',
  units_available: 1,
  rental_option:   0,
  contact_phone:   '0858196462',
  featured:        1,
  slug:            'bella-rosa',
}, [
  { filename: 'assets/listing3/IMG_5121.jpeg' },
  { filename: 'assets/listing3/IMG_5125.jpeg' },
  { filename: 'assets/listing3/IMG_5127.jpeg' },
  { filename: 'assets/listing3/IMG_5128.jpeg' },
  { filename: 'assets/listing3/IMG_5130.jpeg' },
]);

/* ── INSURANCE PRODUCTS ── */
const insCount = db.prepare('SELECT COUNT(*) as c FROM insurance_products').get();
if (insCount.c === 0) {
  const insertIns = db.prepare(`
    INSERT INTO insurance_products (title, category, short_description, full_description, icon_name, sort_order, active)
    VALUES (@title, @category, @short_description, @full_description, @icon_name, @sort_order, 1)
  `);
  const products = [
    {
      title: 'Personal Insurance',
      category: 'Personal',
      short_description: 'Life, Funeral, Household, Vehicle & Personal Accident cover tailored for individuals and families.',
      full_description: 'Our personal insurance solutions cover every aspect of your life. From life insurance and funeral cover to household contents and vehicle insurance, we structure cover around your unique needs and budget. Personal accident cover ensures you are protected against unexpected events.',
      icon_name: 'fa-user',
      sort_order: 1,
    },
    {
      title: 'Business Insurance',
      category: 'Commercial',
      short_description: 'Commercial Property, Asset Protection, Liability, Fleet & Employee Cover for businesses of all sizes.',
      full_description: 'We protect businesses across Namibia with comprehensive commercial insurance solutions. Whether you need commercial property cover, asset protection, public liability, fleet insurance or employee cover solutions, our team will structure a package that fits your business environment.',
      icon_name: 'fa-briefcase',
      sort_order: 2,
    },
    {
      title: 'Risk Advisory Services',
      category: 'Advisory',
      short_description: 'Expert risk identification and insurance structuring tailored to your specific environment.',
      full_description: 'We work closely with clients to identify risks and structure suitable insurance solutions tailored to their specific needs and business environments. Our advisors bring deep market knowledge to ensure you have the right cover in place before risks materialise.',
      icon_name: 'fa-magnifying-glass',
      sort_order: 3,
    },
    {
      title: 'Claims Assistance',
      category: 'Support',
      short_description: 'Professional claims guidance and support so you are never alone in a difficult moment.',
      full_description: 'Our team walks with clients throughout the entire claims process, providing guidance, support and efficient handling during difficult times. We advocate on your behalf to ensure fair and prompt settlements, so you can focus on recovery while we handle the paperwork.',
      icon_name: 'fa-handshake',
      sort_order: 4,
    },
  ];
  products.forEach(p => insertIns.run(p));
  console.log(`✓ ${products.length} insurance products created`);
} else {
  console.log('  Insurance products already exist');
}

/* ── SITE SETTINGS ── */
const defaults = {
  hero_headline:       'Find Your Perfect Property',
  hero_subheadline:    'Your Property Journey Starts Here',
  hero_tagline:        'Like a wolf pack, strategic, connected, and dependable.',
  stat_companies:      '2',
  stat_brand:          '1',
  stat_commitment:     '∞',
  stat_region:         'Namibia',
  contact_phone:       '085 819 6462',
  contact_whatsapp:    '264858196462',
  contact_email:       '',
  contact_address:     '',
  footer_tagline:      'Built on Trust. Driven by Unity.',
  footer_description:  'Uniting property and protection under one trusted name across Namibia.',
};
const upsertSetting = db.prepare(
  'INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)'
);
Object.entries(defaults).forEach(([k, v]) => upsertSetting.run(k, v));
console.log('✓ Site settings initialised');

console.log('\nSeed complete. You can now start the server with: npm start');
