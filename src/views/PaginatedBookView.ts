import BookView from "./BookView";

interface PaginatedBookView extends BookView {
    onFirstPage(): boolean;
    onLastPage(): boolean;
    goToPreviousPage(): void;
    goToNextPage(): void;
    getCurrentPage(): number;
    getPageCount(): number;
}
export default PaginatedBookView;