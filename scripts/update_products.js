var util = require('util');
var csv = require('csv-parse');
var fs = require('fs');
var Handlebars = require('handlebars');
var request = require('request');
var _ = require('lodash');
var async = require('async');

var descriptionHtml = "<p>{{description}}</p>" +
  "<table>" +
  "<tbody>" +
  "<tr><td>Publisher</td><td>{{publisher}}</td></tr>" +
  "<tr><td>Publisher Place</td><td>{{publisher_place}}</td></tr>" +
  "<tr><td>Date Published</td><td>{{published_date}}</td></tr>" +
  "<tr><td>Date Published Estimated</td><td>{{published_date_approximate}}</td></tr>" +
  "<tr><td>Edition</td><td>{{edition_string}}</td></tr>" +
  "<tr><td>Number of Volumes</td><td>{{volume_number}}</td></tr>" +
  "<tr><td>Reprint</td><td>{{reprint}}</td></tr>" +
  "<tr><td>Condition</td><td>{{condition}}</td></tr>" +
  "<tr><td>Condition Description</td><td>{{condition_description}}</td></tr>" +
  "<tr><td>ISBN</td><td>{{isbn}}</td></tr>" +
  "<tr><td>Limited Edition</td><td>{{limited_edition}}</td></tr>" +
  "</tbody>" +
  "</table>";

var descriptionTemplate = Handlebars.compile(descriptionHtml);

var skumap = JSON.parse(fs.readFileSync('./output/products.json'));

var config = JSON.parse(fs.readFileSync('./config.json'));

var urlFormat = "https://%s:%s@nhbooks.myshopify.com/admin/products/%s.json";

var editionStrings = ["First", "Second", "Third", "Forth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifthteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth"];

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

        // Fix edition
        if (product.edition > 0) {
          product.edition_string = editionStrings[product.edition - 1];
        }

        var outProduct = {};
        outProduct.id = map.id;
        outProduct.vendor = product.author;
        outProduct.product_type = "Book";
        outProduct.body_html = descriptionTemplate(product);
        products.push(outProduct);
      }
    }
    updateProducts(products);
  }
});




var updateProducts = function(products) {
  var cycle = 500;
  var successes = [];
  var index = -1;

  var successFilePath = 'updateproducts.success.log';
  var errorFilePath = 'updateproducts.errors.log';


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
      product: product
    };
    request({
      method: 'PUT',
      url: util.format(urlFormat, config.api_key, config.password, product.id),
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
