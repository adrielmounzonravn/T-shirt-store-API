BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM users
    WHERE email IN ('manager@tshirtstore.dev', 'client@tshirtstore.dev')
  ) <> 2 THEN
    RAISE EXCEPTION 'Aborting: the two demo accounts were not found.';
  END IF;
END $$;

DELETE FROM cart_products;
DELETE FROM orders;
DELETE FROM cart_numbers;
DELETE FROM liked_products;
DELETE FROM users_auth;

DELETE FROM users
WHERE email NOT IN ('manager@tshirtstore.dev', 'client@tshirtstore.dev');

DELETE FROM variant_images
WHERE sku_id IN (
  SELECT sku_id FROM product_variants
  WHERE sku_id::text NOT LIKE '22222222-2222-4222-8222-%'
);

DELETE FROM product_variants
WHERE sku_id::text NOT LIKE '22222222-2222-4222-8222-%';

DELETE FROM product_images
WHERE product_id IN (
  SELECT product_id FROM products
  WHERE product_id::text NOT LIKE '11111111-1111-4111-8111-%'
);

DELETE FROM products
WHERE product_id::text NOT LIKE '11111111-1111-4111-8111-%';

COMMIT;
