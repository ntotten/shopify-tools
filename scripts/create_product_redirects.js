var util = require('util');
var csv = require('csv-parse');
var fs = require('fs');
var request = require('request');
var _ = require('lodash');


var urlFormat = "https://%s:%s@nhbooks.myshopify.com/admin/redirects.json";

var skumap = JSON.parse(fs.readFileSync('./output/products.json'));

var config = JSON.parse(fs.readFileSync('./config.json'));

var input = fs.readFileSync('./output/products.csv')
csv(input, {
  'columns': true
}, function(err, output) {
  if (err) {
    console.log(err);
  } else {
    var products = [];
    for (var i = 0; i < output.length; i++) {
      var product = output[i];
      if (product.sku.trim() !== '') {
        var map = _.find(skumap, function(item) {
          return item.sku == product.sku;
        });

        var outProduct = {};
        outProduct.id = map.id;
        outProduct.sku = product.sku;
        outProduct.url_key = product.url_key;
        products.push(outProduct);
      }
    }
    createRedirects(products);
  }
});


var createRedirects = function(products) {
  var cycle = 500;
  var successes = [];
  var index = -1;

  var successFilePath = 'product_redirects.success.log';
  var errorFilePath = 'product_redirects.errors.log';


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
        // If this redirect was already created, skip it and move on
        next();
      } else if (product.url_key === product.sku) {
        console.log('redirect not required for: ' + product.id)
        // If we dont need a redirect for this product, skip it and move on
        next();
      } else {
        setTimeout(function() {
          createRedirect(product);
        }, cycle);
      }
    } else {
      // Exit the loop
      console.log("Wrote " + successes.length + ' url rewrites.');
    }
  };

  var createRedirect = function(product) {
    var data = {
      redirect: {
        path: "/" + product.url_key,
        target: "/products/" + product.url_key
      }
    };
    request({
      method: 'POST',
      url: util.format(urlFormat, config.api_key, config.password),
      json: data
    }, function(error, response, body) {
      if (!error && response.statusCode == 201) {
        console.log('Created redirect for: ' + product.id);
        successes.push(product.id);
        writeLogEntry(successFilePath, product.id);
      } else {
        console.log('Error creating redirect for: ' + product.id);
        console.log('path: ' + data.redirect.path);
        console.log('target: ' + data.redirect.target);
        console.log(body);
        writeLogEntry(errorFilePath, product.id);
      }
      // Finished creating redirect, move to the next one
      next();
    });
  };
  // Start the loop
  next();
}
