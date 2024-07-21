import { Request } from "express";
import { TryCatch } from "../middlewares/error.js";
import { SearchQuery, newProdReq, searchProdQuery } from "../types/products.js";
import { ProductSchema } from "../models/products.js";
import ErrorHandler from "../utils/uitlity-class.js";
import { rm } from "fs";
import { myCache } from "../index.js";
import { invalidateCache } from "../utils/features.js";

// Admin can add new products using this controller function......
export const NewProd = TryCatch(
  async (req: Request<{}, {}, newProdReq>, res, next) => {
    const { name, price, stocks, category ,description} = req.body;
    const photo = req.file;
    if (!photo) return next(new ErrorHandler("Please Add Photo", 400));

    if (!name || !price || !stocks || !category|| !description) {
      rm(photo.path, () => {
        console.log("Deleted");
      });
      return next(new ErrorHandler("Please enter all the fields", 400));
    }

    await ProductSchema.create({
      name,
      price,
      stocks,
      description,
      category: category.toLowerCase(),
      photo: photo.path,
    });

    // revalidating all the cache key's 
    invalidateCache({product:true,admin:true});
    return res.status(201).json({
      success: true,
      message: "Product Created Successfully",
    });
  }
);

// Users can see latest added products using this controller function......
export const latestProducts = TryCatch(async (req, res) => {
  let products;

  if (myCache.has("latest")) {
    products = JSON.parse(myCache.get("latest") as string);
  } else {
    products = await ProductSchema.find({})
      .sort({
        createdAt: -1,
      })
      .limit(25);
    myCache.set("latest", JSON.stringify(products));
  }
  return res.status(200).json({
    success: true,
    products,
  });
});

// User can see products accroding to the categories using this controller function......
export const prodCategory = TryCatch(async (req, res) => {
  let category;
  if (myCache.has("category")) {
    category = JSON.parse(myCache.get("category") as string);
  } else {
    category = await ProductSchema.distinct("category");
    myCache.set("category", JSON.stringify(category));
  }
  return res.status(200).json({
    success: true,
    category,
  });
});

// Admin can get all products using this controller function......
export const getAllProducts = TryCatch(async (req, res) => {
  let products;
  if (myCache.has("all-products")) {
    products = JSON.parse(myCache.get("all-products") as string);
  } else {
    products = await ProductSchema.find({});
    myCache.set("all-products", JSON.stringify(products));
  }
  return res.status(200).json({
    success: true,
    products,
  });
});

// User can get single products using this controller function......
export const getSingleProduct = TryCatch(async (req, res, next) => {
  let product;
  const { id } = req.params;
  if (myCache.has(`product-${id}`)) {
    product = JSON.parse(myCache.get(`product-${id}`) as string);
  } else {
    product = await ProductSchema.findById(id);
    if (!product) return next(new ErrorHandler("Product Id not found", 404));
    myCache.set(`product-${id}`, JSON.stringify(product));
  }
  return res.status(200).json({
    success: true,
    product,
  });
});

// Admin can delete product by product-id using this controller function......
export const deleteProdById = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const product = await ProductSchema.findById(id);
  if (!product)
    return next(new ErrorHandler("Product already deleted or not found", 404));
  await product.deleteOne();
  rm(product.photo, () => {
    console.log("Deleted Photo asa well Successfully");
  });

  // revalidating all the cache key's 
  invalidateCache({product:true,admin:true,productId:String(product._id)})
  return res.status(200).json({
    success: true,
    message: "Product Deleted Successfully!",
  });
});

// Admin can update products by product-id using this controller function......
export const updateProdById = TryCatch(
  async (req: Request<any, {}, newProdReq>, res, next) => {
    const { id } = req.params;
    const { name, price, stocks, category,description } = req.body;
    const photo = req.file;
    const product = await ProductSchema.findById(id);
    if (!product) return next(new ErrorHandler("Prdouct not found", 404));
    if (name) product.name = name;
    if (price) product.price = price;
    if (stocks) product.stocks = stocks;
    if (category) product.category = category;
    if (description) product.description = description;
    if (photo) {
      rm(product.photo, () => {
        console.log("Old Photo Deleted Successfully");
      });
      product.photo = photo.path;
    }
    await product.save();

    // revalidating all the cache key's 
    invalidateCache({product:true,admin:true,productId:String(product._id)})
    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  }
);

// User can search and apply filters on products using this controller function......
export const searchProduct = TryCatch(
  async (req: Request<{}, {}, {}, searchProdQuery>, res, next) => {
    const { search, sort, category, price } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(process.env.LimitPerPage) || 8;
    const skip = Number((page - 1) * limit);
    const searchQuery: SearchQuery = {};

    if (search)
      searchQuery.name = {
        $regex: search,
        $options: "i",
      };
    if (price)
      searchQuery.price = {
        $lte: Number(price),
      };
    if (category) searchQuery.category = category;
    const [products, allProducts] = await Promise.all([
      ProductSchema.find(searchQuery)
        .sort(sort && { price: sort === "asc" ? 1 : -1 })
        .limit(limit)
        .skip(skip),
      ProductSchema.find(searchQuery),
    ]);
    const totalPage = Math.ceil(allProducts.length / limit);
    return res.status(200).json({ success: true, products, totalPage });
  }
);
