package main

import (
	"fmt"
	"maps"
	"slices"

	// "io"
	"net/http"
	"strings"

	"github.com/neurosnap/sentences"
	"golang.org/x/net/html"
)

type node interface {
}

type ref struct {
	link string
	text string
}

type row []string
type table []row

// figure can be an image or a table with a caption
type figure struct {
	imgSrc  string
	table   table
	caption string
	refs    []ref
}

type sentence struct {
	text string
	refs []ref
}

type paragraph struct {
	sentences []sentence
}

type section struct {
	number  int
	name    string
	body    []paragraph
	figures []figure
}

type scraper struct {
	url      string
	abstract string
	sections []section
	figures  []figure
}

func main() {
	// pdfPath := path.Join("/", "home", "jacob", "projects", "small-examples", "pdf-parsing", "static-contextualization-paper.pdf")
	// outputFileName := "out"
	// cmd := exec.Command("pdftohtml", "-s", "-noframes", pdfPath, outputFileName)
	// if err := cmd.Run(); err != nil {
	// 	fmt.Println(err)
	// }

	arxivUrl := "https://arxiv.org/abs/2409.00921"
	arxivHtmlUrl := htmlOfArxivUrl(arxivUrl)
	fmt.Println(arxivHtmlUrl)
	scraper := scraper{url: arxivHtmlUrl}

	resp, err := http.Get(arxivHtmlUrl)

	if err != nil {
		fmt.Println(err)
		return
	}

	defer resp.Body.Close()

	// bytes, err := io.ReadAll(resp.Body)
	// if err != nil {
	// 	fmt.Println(err)
	// 	return
	// }
	// fmt.Println("HTML:\n\n", string(bytes))

	doc, err := html.Parse(resp.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	scraper.traverseNode(doc)
}

func htmlOfArxivUrl(url string) string {
	parts := strings.Split(url, "/")
	parts[3] = "html"
	parts[4] = parts[4] + "v1"
	return strings.Join(parts, "/")
}

func (s *scraper) traverseNode(n *html.Node) {
	// fmt.Println(n.Type, n.Data)
	if n.Type == html.ElementNode && n.Data == "div" {
		s.handleDiv(n)
	} else if n.Type == html.ElementNode && n.Data == "figure" {
		fig := s.extractFigure(n)
		s.figures = append(s.figures, fig)
		// fmt.Println(fig)
		// fmt.Println("")
	} else if n.Type == html.ElementNode && n.Data == "section" {
		s.extractSection(n)
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		s.traverseNode(c)
	}
}

func (s *scraper) extractHeading(n *html.Node) string {
	heading := ""
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "span" {
			heading += c.FirstChild.Data
		} else if c.Type == html.TextNode {
			heading += c.Data
		}
	}
	return heading
}

func (s *scraper) extractCite(n *html.Node) string {

}

func (s *scraper) extractParagraph(n *html.Node) {
	paragraph := paragraph{}
	sentences := []sentence{}
	citations := []ref{}

	currSentence := ""

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			text := c.Data

		} else if c.Type == html.ElementNode && c.Data == "cite" {

		} else if c.Type == html.ElementNode && c.Data == "em" {

		}

	}
}

func (s *scraper) extractDiv(n *html.Node) {
	for _, a := range n.Attr {
		if a.Key == "class" && strings.Contains(a.Val, "ltx_abstract") {
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && c.Data == "p" {
					s.abstract = c.FirstChild.Data
				}
			}
		} else if a.Key == "class" && strings.Contains(a.Val, "ltx_para") {
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && c.Data == "p" {
					s.extractParagraph(c)
				}
			}

		}
	}
}

func (s *scraper) extractSection(n *html.Node) section {
	var section section
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "h2" {
			heading := s.extractHeading(c)
			section.name = heading
			// fmt.Println(heading)
		} else if c.Type == html.ElementNode && c.Data == "div" {
			s.extractDiv(c)
			// extract paragraph.
			// each paragraph has text and an optional citation.
			// it's probably a better idea to split these into sentences and have corresponding citations.
		}
	}
	return section
}

func (s *scraper) handleDiv(n *html.Node) {
	for _, a := range n.Attr {
		if a.Key == "class" && strings.Contains(a.Val, "ltx_abstract") {
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && c.Data == "p" {
					s.abstract = c.FirstChild.Data
				}
			}
		}
	}
}

func (s *scraper) extractFigure(n *html.Node) figure {
	var figure figure

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "img" {
			for _, a := range c.Attr {
				if a.Key == "src" {
					figure.imgSrc = s.url + "/" + a.Val
				}
			}
		} else if c.Type == html.ElementNode && c.Data == "figcaption" {
			caption, refs := s.extractCaption(c)
			figure.caption = caption
			figure.refs = append(figure.refs, refs...)
		}
	}

	return figure
}

func (s *scraper) extractSpan(n *html.Node) (string, []ref) {
	caption := ""
	refs := []ref{}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			caption += c.Data
		} else if c.Type == html.ElementNode && c.Data == "span" {
			capt, rs := s.extractSpan(c)
			caption += capt
			refs = append(refs, rs...)
		} else if c.Type == html.ElementNode && c.Data == "a" {
			capt, rs := s.extractAnchor(c)
			caption += capt
			refs = append(refs, rs...)
		}
	}

	return caption, refs
}

func (s *scraper) extractAnchor(n *html.Node) (string, []ref) {
	caption := ""
	refs := []ref{}
	ref := ref{}
	for _, a := range n.Attr {
		if a.Key == "href" {
			ref.link = a.Val
		} else if a.Key == "title" {
			ref.text = a.Val
		}
	}

	refs = append(refs, ref)

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			caption += c.Data
		} else if c.Type == html.ElementNode && c.Data == "span" {
			capt, rs := s.extractSpan(c)
			caption += capt
			refs = append(refs, rs...)
		}
	}
	return caption, refs
}

func (s *scraper) extractCaption(n *html.Node) (string, []ref) {
	caption := ""
	refs := []ref{}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "span" {
			capt, rs := s.extractSpan(c)
			caption += capt
			refs = append(refs, rs...)
		}
	}

	return caption, refs
}

func (s *scraper) handleFigure(n *html.Node) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "img" {
			for _, a := range c.Attr {
				if a.Key == "src" {
					fmt.Println("figure source: ", a.Val)
				}
			}
		} else if c.Type == html.ElementNode && c.Data == "figcaption" {
			s.handleCaption(c)
			// caption := ""
			// traverse through first child span
		}
	}
}

func (s *scraper) handleCaption(n *html.Node) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "span" {
			s.handleSpan(c)
		}
	}
}

func (s *scraper) handleSpan(n *html.Node) {
	// a span can have a nested span or an anchor tag
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			fmt.Print(c.Data)
		} else if c.Type == html.ElementNode && c.Data == "span" {
			s.handleSpan(c)
		} else if c.Type == html.ElementNode && c.Data == "a" {
			s.handleAnchor(c)
		}
	}
	// an anchor tag can have a nested span
}

func (s *scraper) handleAnchor(n *html.Node) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			fmt.Print(c.Data)
		} else if c.Type == html.ElementNode && c.Data == "span" {
			s.handleSpan(c)
		}
	}
}

// At this point, there is an html file and a bunch of png files
// Handle text
// Handle image
// Image is grouped into two categories: page background of the pdf, and the individual components that make up the background.
// Page image is <outputFileName>001.png, and component image is <outputFileName>-1_1.png

/*
	There are a couple ways to do this:

	Option 1: Use mutool convert and stream the html and parse base64 image and texts.
	Pros:
		- Probably simple code
		- It's pretty simple to tell what p tag belongs to what image.
		- mutool is pretty quick with the conversion at around 10 seconds or less.
	Cons:
		- The html file is huge, so it might be hard on the parser.
		- mupdf uses an annoying license.

	Option 2: Use pdftohtml and stream the html.
	Pros:
		- Images are easier because they are saved as an external png files.
		- Images are also taxonomized into page image -> component images.
		- Image to p tag mapping is still simple.
		- No lisence issues.
	Cons:
		- The initial run of pdftohtml is very slow at over a minute long. This is paper-dependent, however.

	Option 3: Extract the html text and image separately, then try mapping the image to a caption
	Desc:
		- We can use mutool or pdfimages to extract images. mutool comes with the benefit of preserving object id in the image file name.
		- We use pdfimages to list images. This shows the images and their object ids.
		- Use PyMuPDF to get the bbox of an image given its object id, and try to find a p tag within 30-50px below it. Could also use mupdf.js.
	Pros:
		- Probably the lightest method. No need to wait around for pdftohtml, and no need to parse huge html files.
	Cons:
		- Complex chain of tools.
		- Not guaranteed to get the caption.

	ACTUALLY, there might be an option 4.
	Option 4: Paste an arxiv link to the html viewer.
	Pros:
	- The structure is a LOT easier to parse. No text-figure issue.
	- Let's go with this option!
*/
