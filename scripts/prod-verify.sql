SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'users_auth', count(*) FROM users_auth
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'product_variants', count(*) FROM product_variants
UNION ALL SELECT 'product_images', count(*) FROM product_images
UNION ALL SELECT 'variant_images', count(*) FROM variant_images
UNION ALL SELECT 'cart_numbers', count(*) FROM cart_numbers
UNION ALL SELECT 'cart_products', count(*) FROM cart_products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'liked_products', count(*) FROM liked_products
ORDER BY 1;

SELECT email, role, "isVerified" FROM users ORDER BY email;

SELECT name, status, deleted_at IS NOT NULL AS soft_deleted
FROM products ORDER BY name;
