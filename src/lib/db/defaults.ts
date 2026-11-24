import type { MediaRuleConfig, SchemaFieldRule } from '@/lib/types/intake';

export const DEFAULT_BLUEPRINTS: Array<{
  slug: string;
  name: string;
  description: string;
  targetType: 'ecommerce_catalog' | 'agency_kickoff';
  sqlTableName: string;
  schemaRules: SchemaFieldRule[];
  mediaRules: MediaRuleConfig;
}> = [
  {
    slug: 'shopify-d2c-catalog',
    name: 'E-Commerce Product Catalog Intake',
    description:
      'Normalizes chaotic supplier Excel workbooks and raw product photos into clean Shopify/SQL records and SKU-linked 1080x1080 WebP images.',
    targetType: 'ecommerce_catalog',
    sqlTableName: 'catalog_products',
    schemaRules: [
      {
        key: 'sku',
        label: 'SKU Code',
        type: 'sku',
        required: true,
        aliases: ['sku', 'item_code', 'product_id', 'code', 'article_no', 'model'],
      },
      {
        key: 'title',
        label: 'Product Title',
        type: 'string',
        required: true,
        aliases: ['title', 'name', 'product_name', 'item_name', 'product', 'description_short'],
      },
      {
        key: 'category',
        label: 'Category',
        type: 'string',
        required: false,
        aliases: ['category', 'type', 'department', 'collection', 'group'],
      },
      {
        key: 'price',
        label: 'Unit Price',
        type: 'currency',
        required: true,
        aliases: ['price', 'mrp', 'rate', 'unit_price', 'cost', 'amt', 'amount', 'selling_price'],
      },
      {
        key: 'stock',
        label: 'Inventory Qty',
        type: 'number',
        required: true,
        aliases: ['stock', 'qty', 'quantity', 'inventory', 'units', 'count', 'available'],
      },
      {
        key: 'gstin',
        label: 'Supplier GSTIN',
        type: 'gstin',
        required: false,
        aliases: ['gstin', 'gst', 'tax_id', 'vat_number'],
      },
    ],
    mediaRules: {
      minWidth: 800,
      minHeight: 800,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
      outputFormat: 'webp',
      deduplicateByHash: true,
      autoHealOffRatio: true,
    },
  },
  {
    slug: 'agency-client-kickoff',
    name: 'Software & Branding Agency Kickoff',
    description:
      'Transforms unformatted client feature notes, brand assets, and stakeholder lists into verified Markdown specs, SQL tables, and high-res PNG brand packs.',
    targetType: 'agency_kickoff',
    sqlTableName: 'agency_deliverables',
    schemaRules: [
      {
        key: 'module_id',
        label: 'Module / Epic ID',
        type: 'sku',
        required: true,
        aliases: ['module_id', 'id', 'code', 'ticket', 'ref', 'milestone'],
      },
      {
        key: 'feature_name',
        label: 'Deliverable Name',
        type: 'string',
        required: true,
        aliases: ['feature_name', 'feature', 'deliverable', 'task', 'item', 'title'],
      },
      {
        key: 'owner_email',
        label: 'Client Stakeholder Email',
        type: 'email',
        required: true,
        aliases: ['owner_email', 'email', 'contact', 'stakeholder_email', 'lead_email'],
      },
      {
        key: 'allocated_budget',
        label: 'Budget Allocation',
        type: 'currency',
        required: false,
        aliases: ['allocated_budget', 'budget', 'cost', 'fee', 'estimate'],
      },
      {
        key: 'priority',
        label: 'Priority Tier',
        type: 'string',
        required: true,
        aliases: ['priority', 'urgency', 'tier', 'importance', 'phase'],
      },
    ],
    mediaRules: {
      minWidth: 512,
      minHeight: 512,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
      outputFormat: 'png',
      deduplicateByHash: true,
      autoHealOffRatio: true,
    },
  },
];
