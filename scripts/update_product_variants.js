var util = require('util');
var csv = require('csv-parse');
var fs = require('fs');
var Handlebars = require('handlebars');
var request = require('request');
var _ = require('lodash');
var async = require('async');

var config = JSON.parse(fs.readFileSync('./config.json'));

var productVarientsFile = './output/products_with_varients.json';
var urlFormat = "https://%s:%s@nhbooks.myshopify.com/admin/products.json?fields=id,variants&page=%s&limit=%s";
var urlUpdateFormat = "https://%s:%s@nhbooks.myshopify.com/admin/variants/%s.json";

var allProducts = [];
var page = 0;
var limit = 250;

var complete = function() {
  fs.writeFileSync(productVarientsFile, JSON.stringify(allProducts));
  updateProducts(allProducts);
}

var loadProducts = function(page, callback) {
  console.log("Downloading products on page: " + page);
  var url = util.format(urlFormat, config.api_key, config.password, page, limit);
  request(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var data = JSON.parse(body);
      callback(data.products);
    }
  })
}

var processProducts = function(products) {
  for (var i = 0; i < products.length; i++) {
    var product = products[i];
    allProducts.push({ id: product.id, variant_id: product.variants[0].id });
  }

  if (products.length < limit) {
    complete();
  } else {
    page++;
    loadProducts(page, processProducts);
  }
}


var updateProducts = function(products) {
  var cycle = 500;
  var successes = [];
  var index = -1;

  var successFilePath = 'updateproduct_varients.success.log';
  var errorFilePath = 'updateproduct_varients.errors.log';


  if (fs.existsSync(successFilePath)) {
    successes = JSON.parse(fs.readFileSync(successFilePath));
  }

  var writeLogEntry = function(filePath, productId) {
    var productsIds = [];
    if (fs.existsSync(filePath)) {
      productsIds = JSON.parse(fs.readFileSync(filePath));
    }
    productsIds.push(productId)
    fs.writeFileSync(filePath, JSON.stringify(productsIds));
  }

  var next = function() {
    index++;
    if (index < products.length) {
      var product = products[index];
      // Check if this product is in the success list
      var success = _.find(successes, function(item) {
        return item === product.id;
      });

      if (success) {
        console.log('skipping: ' + product.id)
        // If this product was already updated, skip it and move on
        next();
      } else {
        setTimeout(function() {
          updateProduct(product);
        }, cycle);
      }
    } else {
      // Exit the loop
      console.log("Completed migrating " + successes.length + ' products.');
    }
  };

  var updateProduct = function(product) {
    var data = {
      variant: {
        id: product.variant_id,
        grams: 453.592
      }
    };
    request({
      method: 'PUT',
      url: util.format(urlUpdateFormat, config.api_key, config.password, product.variant_id),
      json: data
    }, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log('Updated product: ' + product.id);
        successes.push(product.id);
        writeLogEntry(successFilePath, product.id);
      } else {
        console.log('Error updating product: ' + product.id);
        writeLogEntry(errorFilePath, product.id);
      }
      // Finished updating product, move to the next one
      next();
    });
  };
  // Start the loop
  next();
}


if (!fs.existsSync(productVarientsFile)) {
  loadProducts(page, processProducts);
} else {
  var json = fs.readFileSync(productVarientsFile);
  var allProducts = JSON.parse(json);
  updateProducts(allProducts);
}
